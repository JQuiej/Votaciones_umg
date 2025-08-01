'use client'

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image'; // Importar el componente Image de Next.js
import { supabase } from '../../../lib/supabaseClient';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import styles from './page.module.css';

// Estructura de datos modificada para soportar actualizaciones incrementales
interface OptionCount {
  name: string;
  count: number; // Para tipos 1 y 2: conteo de votos. Para 3 y 4: promedio.
  url_imagen?: string;
  // Campos adicionales para recálculo de promedios (tipos 3 y 4)
  voteCount?: number; // Número total de votos para esta opción/pregunta
  sumOfValues?: number; // Suma total de puntuaciones o rankings
}

interface QuestionData {
  id_pregunta: number;
  texto_pregunta: string;
  url_imagen?: string;
  options: OptionCount[];
}

export default function RealtimeSelectionPage() {
  const [view, setView] = useState<'bar' | 'pie'>('bar');
  const [data, setData] = useState<QuestionData[]>([]);
  const [pollTitle, setPollTitle] = useState<string | null>(null);
  const [pollType, setPollType] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Usar useRef para manejar el ID del intervalo de forma segura
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    
    // --- Lógica de Carga de Datos ---
    const loadData = async (isInitialLoad = false) => {
      if (isInitialLoad) setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('No se pudo identificar al usuario. Por favor, inicie sesión.');
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setLoading(false);
        return;
      }

      const { data: poll, error: pollErr } = await supabase
        .from('encuestas')
        .select('id_encuesta, id_tipo_votacion, titulo')
        .eq('estado', 'activa')
        .eq('id_usuario_creador', user.id)
        .single();

      if (pollErr || !poll) {
        setError('No tienes una encuesta activa en este momento.');
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setLoading(false);
        return;
      }
      
      const { id_encuesta: pollId, id_tipo_votacion, titulo: poll_title } = poll;
      setPollType(id_tipo_votacion);
      setPollTitle(poll_title);
      
      const { data: qs, error: qe } = await supabase
        .from('preguntas_encuesta')
        .select('id_pregunta, texto_pregunta, url_imagen')
        .eq('id_encuesta', pollId)
        .order('id_pregunta', { ascending: true });

      if (qe || !qs) {
        setError('Error al cargar preguntas.');
        setLoading(false);
        return;
      }
      const questionIds = qs.map(q => q.id_pregunta);

      const { data: opts, error: optsErr } = await supabase
        .from('opciones_pregunta')
        .select('id_opcion, texto_opcion, url_imagen, id_pregunta')
        .in('id_pregunta', questionIds);

      if (optsErr || !opts) {
        setError('Error al cargar opciones.');
        setLoading(false);
        return;
      }
      
      const { data: votes, error: vErr } = await supabase
          .from('votos_respuestas')
          .select('id_pregunta, id_opcion_seleccionada, valor_puntuacion, orden_ranking')
          .in('id_pregunta', questionIds);

      if (vErr) {
        setError(vErr.message);
        setLoading(false);
        return;
      }

      // --- Procesamiento de Votos ---
      const results = new Map<number, QuestionData>();
      const optionMap = new Map(opts.map(o => [o.id_opcion, o.texto_opcion]));
      
      if (id_tipo_votacion === 1) { // Consolidado
        const consolidatedOptions = new Map<number, OptionCount>();
        opts.forEach(opt => consolidatedOptions.set(opt.id_opcion, {
            name: opt.texto_opcion, count: 0, url_imagen: opt.url_imagen
        }));
        votes?.forEach(v => {
            const opt = consolidatedOptions.get(v.id_opcion_seleccionada!);
            if(opt) opt.count++;
        });
        results.set(0, {
            id_pregunta: 0,
            texto_pregunta: "Resultados Consolidados",
            url_imagen: undefined,
            options: Array.from(consolidatedOptions.values())
        });
      } else { // El resto de tipos son por pregunta
        qs.forEach(q => {
            results.set(q.id_pregunta, {
                id_pregunta: q.id_pregunta,
                texto_pregunta: q.texto_pregunta,
                url_imagen: q.url_imagen,
                options: opts.filter(o => o.id_pregunta === q.id_pregunta).map(o => ({
                    name: o.texto_opcion,
                    count: 0,
                    url_imagen: o.url_imagen,
                    voteCount: 0,
                    sumOfValues: 0,
                }))
            });
        });

        votes?.forEach(v => {
            const questionResult = results.get(v.id_pregunta!);
            if (!questionResult) return;

            if (id_tipo_votacion === 2) {
                const option = questionResult.options.find(o => o.name === optionMap.get(v.id_opcion_seleccionada!));
                if (option) option.count++;
            } else if (id_tipo_votacion === 3) {
                const option = questionResult.options[0];
                option.sumOfValues! += v.valor_puntuacion!;
                option.voteCount!++;
                option.count = option.voteCount! > 0 ? parseFloat((option.sumOfValues! / option.voteCount!).toFixed(2)) : 0;
            } else if (id_tipo_votacion === 4) {
                const option = questionResult.options.find(o => o.name === optionMap.get(v.id_opcion_seleccionada!));
                if (option) {
                    option.sumOfValues! += v.orden_ranking!;
                    option.voteCount!++;
                    option.count = option.voteCount! > 0 ? parseFloat((option.sumOfValues! / option.voteCount!).toFixed(2)) : 0;
                }
            }
        });

        if (id_tipo_votacion === 4) {
            results.forEach(q => q.options.sort((a, b) => a.count - b.count));
        }
      }

      setData(Array.from(results.values()));
      if (isInitialLoad) setLoading(false);
    };
    
    // --- Configuración del Polling ---
    // 1. Carga inicial de datos
    loadData(true); 
    // 2. Inicia el polling y guarda el ID en la referencia
    pollIntervalRef.current = setInterval(() => loadData(false), 5000); 

    // --- Función de Limpieza ---
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  if (loading) return <p className={styles.info}>🔄 Cargando resultados...</p>
  if (error) return <p className={styles.error}>{error}</p>

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28FDF', '#FF6B6B', '#5A9BD5', '#FFD700', '#8A2BE2', '#DC143C', '#228B22', '#FFDAB9'];

  const renderCharts = () => {
    return data.map(qData => (
      <div key={qData.id_pregunta} className={styles.chartBlock}>
        {(data.length > 1 || pollType !== 1) && (
          <h2 className={styles.questionTitle}>{qData.texto_pregunta}</h2>
        )}
        {qData.url_imagen && (
          <Image
            src={qData.url_imagen}
            alt={`Imagen para la pregunta: ${qData.texto_pregunta}`}
            width={200}
            height={150}
            className={styles.questionImg}
            style={{ objectFit: 'contain' }}
          />
        )}
        {pollType === 4 && (
          <p className={styles.rankingInfo}>Menor valor = mejor ranking</p>
        )}
        <ResponsiveContainer width="100%" height={
          pollType === 3 ? 200 :
          qData.options.length > 5 ? 400 :
          300
        }>
          {(pollType === 1 || pollType === 2) && view === 'pie' ? (
            <PieChart>
              <Pie
                data={qData.options}
                dataKey="count"
                nameKey="name"
                cx="50%" cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
              >
                {qData.options.map((_, i) => (
                  <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `${value} votos`} />
              <Legend />
            </PieChart>
          ) : (
            <BarChart data={qData.options}>
              <XAxis
                dataKey="name"
                interval={0}
                angle={qData.options.length > 3 ? -30 : 0}
                textAnchor={qData.options.length > 3 ? "end" : "middle"}
                height={qData.options.length > 3 ? 60 : 30}
              />
              <YAxis
                allowDecimals={pollType === 3 || pollType === 4}
                label={{
                  value: pollType === 1 || pollType === 2 ? 'Número de Votos' :
                         pollType === 3 ? 'Puntuación Promedio' :
                         'Promedio de Ranking',
                  angle: -90,
                  position: 'insideLeft'
                }}
                domain={pollType === 3 ? [0, 10] : [0, 'auto']}
              />
              <Tooltip formatter={(value: number) =>
                pollType === 1 || pollType === 2 ? `${value} votos` :
                `${value.toFixed(2)} (Promedio)`
              } />
              <Bar dataKey="count" fill={
                pollType === 1 ? '#8884d8' :
                pollType === 2 ? '#4CAF50' :
                pollType === 3 ? '#20B2AA' :
                '#FF5733'
              } />
            </BarChart>
          )}
        </ResponsiveContainer>
        <div className={styles.optionList}>
          {qData.options.map((opt, i) => (
            <div key={i} className={styles.optionItem}>
              {opt.url_imagen && (
                <Image
                  src={opt.url_imagen}
                  alt={opt.name}
                  width={50}
                  height={50}
                  className={styles.optionImg}
                  style={{ objectFit: 'cover' }}
                />
              )}
              <span className={styles.optionText}>
                {opt.name}:{' '}
                {pollType === 1 || pollType === 2
                  ? `${opt.count.toString()} votos`
                  : `${opt.count.toFixed(2)} (Prom.)`
                }
              </span>
            </div>
          ))}
        </div>
      </div>
    ))
  }

  return (
    <div className={styles.container}>
      {pollTitle && <h1 className={styles.mainTitle}>{pollTitle}</h1>}
      <h2 className={styles.subTitle}>Resultados en tiempo real</h2>
      {(pollType === 1 || pollType === 2) && (
        <div className={styles.toggleGroup}>
          <button
            className={view === 'bar' ? styles.toggleActive : styles.toggleButton}
            onClick={() => setView('bar')}
          >Barras</button>
          <button
            className={view === 'pie' ? styles.toggleActive : styles.toggleButton}
            onClick={() => setView('pie')}
          >Pastel</button>
        </div>
      )}
      {renderCharts()}
    </div>
  )
}