'use client'

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation'
import { QRCodeCanvas } from 'qrcode.react';
import Swal from 'sweetalert2';
import { Share2 } from 'lucide-react';
import { supabase } from '../../../../lib/supabaseClient';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import styles from './page.module.css';

// Interfaces
interface OptionCount {
  name: string;
  count: number;
  url_imagen?: string;
  voteCount?: number;
  sumOfValues?: number;
}

interface QuestionData {
  id_pregunta: number;
  texto_pregunta: string;
  url_imagen?: string;
  options: OptionCount[];
}

interface PollDetails {
    id_encuesta: number;
    id_tipo_votacion: number;
    titulo: string;
    estado: string;
    url_votacion: string;
    codigo_acceso: string;
}

export default function RealtimePollResultsPage() {
  const params = useParams();
  const router = useRouter()
  
  const [pollDetails, setPollDetails] = useState<PollDetails | null>(null);
  const [view, setView] = useState<'bar' | 'pie'>('bar');
  const [data, setData] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const pollIdFromUrl = parseInt(params.id as string, 10);
    if (isNaN(pollIdFromUrl)) {
      setError("El ID de la encuesta no es válido.");
      setLoading(false);
      return;
    }
    const loadData = async (isInitialLoad = false) => {
      if (isInitialLoad) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('No se pudo identificar al usuario. Por favor, inicie sesión.');
        setLoading(false);
        return;
      }
      const { data: poll, error: pollErr } = await supabase
        .from('encuestas')
        .select('id_encuesta, id_tipo_votacion, titulo, estado, url_votacion, codigo_acceso')
        .eq('id_usuario_creador', user.id)
        .eq('id_encuesta', pollIdFromUrl)
        .single();
      if (pollErr || !poll) {
        setError('No se encontró la encuesta o no tienes permiso para verla.');
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setLoading(false);
        return;
      }
      setPollDetails(poll);
      const { id_encuesta: pollId, id_tipo_votacion, estado } = poll;
      const { data: qs, error: qe } = await supabase.from('preguntas_encuesta').select('id_pregunta, texto_pregunta, url_imagen').eq('id_encuesta', pollId).order('id_pregunta', { ascending: true });
      if (qe || !qs) { setError('Error al cargar preguntas.'); setLoading(false); return; }
      const questionIds = qs.map(q => q.id_pregunta);
      const { data: opts, error: optsErr } = await supabase.from('opciones_pregunta').select('id_opcion, texto_opcion, url_imagen, id_pregunta').in('id_pregunta', questionIds);
      if (optsErr || !opts) { setError('Error al cargar opciones.'); setLoading(false); return; }
      const { data: votes, error: vErr } = await supabase.from('votos_respuestas').select('id_pregunta, id_opcion_seleccionada, valor_puntuacion, orden_ranking').in('id_pregunta', questionIds);
      if (vErr) { setError(vErr.message); setLoading(false); return; }
      const results = new Map<number, QuestionData>();
      const optionMap = new Map(opts.map(o => [o.id_opcion, o.texto_opcion]));
      if (id_tipo_votacion === 1) {
        const consolidatedOptions = new Map<number, OptionCount>();
        opts.forEach(opt => consolidatedOptions.set(opt.id_opcion, { name: opt.texto_opcion, count: 0, url_imagen: opt.url_imagen }));
        votes?.forEach(v => { const opt = consolidatedOptions.get(v.id_opcion_seleccionada!); if(opt) opt.count++; });
        results.set(0, { id_pregunta: 0, texto_pregunta: "Resultados Consolidados", url_imagen: undefined, options: Array.from(consolidatedOptions.values()) });
      } else {
        qs.forEach(q => {
          const questionOptions = opts.filter(o => o.id_pregunta === q.id_pregunta).map(o => ({ name: o.texto_opcion, count: 0, url_imagen: o.url_imagen, voteCount: 0, sumOfValues: 0 }));
          results.set(q.id_pregunta, { id_pregunta: q.id_pregunta, texto_pregunta: q.texto_pregunta, url_imagen: q.url_imagen, options: questionOptions });
        });
        votes?.forEach(v => {
            const questionResult = results.get(v.id_pregunta!);
            if (!questionResult) return;
            const option = questionResult.options.find(o => o.name === optionMap.get(v.id_opcion_seleccionada!));
            if (option) {
                if (id_tipo_votacion === 2) { option.count++; } 
                else if (id_tipo_votacion === 3) {
                    option.sumOfValues! += v.valor_puntuacion!; option.voteCount!++; option.count = option.voteCount! > 0 ? parseFloat((option.sumOfValues! / option.voteCount!).toFixed(2)) : 0;
                } else if (id_tipo_votacion === 4) {
                    option.sumOfValues! += v.orden_ranking!; option.voteCount!++; option.count = option.voteCount! > 0 ? parseFloat((option.sumOfValues! / option.voteCount!).toFixed(2)) : 0;
                }
            }
        });
        if (id_tipo_votacion === 4) { results.forEach(q => q.options.sort((a, b) => a.count - b.count)); }
      }
      setData(Array.from(results.values()));
      if (isInitialLoad) {
        setLoading(false);
        if (estado === 'activa') { pollIntervalRef.current = setInterval(() => loadData(false), 5000); }
      }
    };
    loadData(true);
    return () => { if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); } };
  }, [params.id]);

  // CORRECCIÓN #1: La función se mueve al cuerpo principal del componente.
  const handleShare = () => {
    if (!pollDetails) return;

    // CORRECCIÓN #2: Usamos el método robusto de convertir el canvas a una imagen.
    const canvas = document.getElementById('hidden-qr-canvas') as HTMLCanvasElement;
    if (!canvas) {
      Swal.fire('Error', 'No se pudo generar el código QR.', 'error');
      return;
    }
    const qrImageUrl = canvas.toDataURL('image/png');

    Swal.fire({
      title: 'Comparte tu Encuesta',
      html: `
        <div class="${styles.shareModalContent}">
          <p>Los participantes pueden escanear el código QR o usar el enlace y el código de acceso.</p>
          <div class="${styles.qrContainerModal}">
            <img src="${qrImageUrl}" alt="Código QR" style="width: 200px; height: 200px;" />
          </div>
          <div class="${styles.shareInfo}">
            <strong>Enlace:</strong>
            <input type="text" value="${pollDetails.url_votacion}" readonly class="${styles.shareInput}" />
            <strong>Código de Acceso:</strong>
            <input type="text" value="${pollDetails.codigo_acceso}" readonly class="${styles.shareInput}" />
          </div>
        </div>
      `,
      showCloseButton: true,
      showConfirmButton: false,
      width: '400px',
    });
  };

  if (loading) return <p className={styles.info}>Cargando resultados...</p>;
  if (error) return <p className={styles.error}>{error}</p>;
  if (!pollDetails) return <p className={styles.info}>No se encontraron detalles de la encuesta.</p>;

  // CORRECCIÓN #3: Se usa un único estado `pollDetails` como fuente de verdad.
  const { titulo: pollTitle, id_tipo_votacion: pollType } = pollDetails;
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28FDF', '#FF6B6B', '#5A9BD5', '#FFD700', '#8A2BE2', '#DC143C', '#228B22', '#FFDAB9'];
 
  const renderCharts = () => {
    return data.map(qData => (
      <div key={qData.id_pregunta} className={styles.chartBlock}>
        {(data.length > 1 || pollType !== 1) && ( <h2 className={styles.questionTitle}>{qData.texto_pregunta}</h2> )}
        {qData.url_imagen && ( <Image src={qData.url_imagen} alt={`Imagen para la pregunta: ${qData.texto_pregunta}`} width={200} height={150} className={styles.questionImg} style={{ objectFit: 'contain' }} /> )}
        {pollType === 4 && ( <p className={styles.rankingInfo}>Menor valor = mejor ranking</p> )}
        <ResponsiveContainer width="100%" height={pollType === 3 ? (qData.options.length > 5 ? 400 : 300) : qData.options.length > 5 ? 400 : 300}>
          {(pollType === 1 || pollType === 2) && view === 'pie' ? (
            <PieChart>
              <Pie data={qData.options} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                {qData.options.map((_, i) => (<Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />))}
              </Pie>
              <Tooltip formatter={(value: number) => `${value} votos`} />
              <Legend />
            </PieChart>
          ) : (
            <BarChart data={qData.options}>
              <XAxis dataKey="name" interval={0} angle={qData.options.length > 3 ? -30 : 0} textAnchor={qData.options.length > 3 ? "end" : "middle"} height={qData.options.length > 3 ? 60 : 30} />
              <YAxis allowDecimals={pollType === 3 || pollType === 4} label={{ value: pollType === 1 || pollType === 2 ? 'Número de Votos' : pollType === 3 ? 'Puntuación Promedio' : 'Promedio de Ranking', angle: -90, position: 'insideLeft' }} domain={pollType === 3 ? [0, 10] : [0, 'auto']} />
              <Tooltip formatter={(value: number) => pollType === 1 || pollType === 2 ? `${value} votos` : `${value.toFixed(2)} (Promedio)`} />
              <Bar dataKey="count" fill={pollType === 1 ? '#8884d8' : pollType === 2 ? '#4CAF50' : pollType === 3 ? '#20B2AA' : '#FF5733'} />
            </BarChart>
          )}
        </ResponsiveContainer>
        <div className={styles.optionList}>
          {qData.options.map((opt, i) => (
            <div key={i} className={styles.optionItem}>
              {opt.url_imagen && (<Image src={opt.url_imagen} alt={opt.name} width={50} height={50} className={styles.optionImg} style={{ objectFit: 'cover' }} />)}
              <span className={styles.optionText}>{opt.name}:{' '}{pollType === 1 || pollType === 2 ? `${opt.count.toString()} votos` : `${opt.count.toFixed(2)} (Prom.)`}</span>
            </div>
          ))}
        </div>
      </div>
    ))
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back() } className={styles.backButton}>
          ←
        </button>
        {pollTitle && <h1 className={styles.mainTitle}>{pollTitle}</h1>}
        <button onClick={handleShare} className={styles.shareButton} title="Compartir Encuesta">
            <Share2 size={20} />
            Compartir
        </button>
      </div>
      <h2 className={styles.subTitle}>Resultados en tiempo real</h2>
      {(pollType === 1 || pollType === 2) && (
        <div className={styles.toggleGroup}>
          <button className={view === 'bar' ? styles.toggleActive : styles.toggleButton} onClick={() => setView('bar')}>Barras</button>
          <button className={view === 'pie' ? styles.toggleActive : styles.toggleButton} onClick={() => setView('pie')}>Pastel</button>
        </div>
      )}
      {renderCharts()}

      {/* CORRECCIÓN #4: El QR oculto ahora tiene un ID para poder encontrarlo */}
      {pollDetails && (
        <div style={{ display: 'none' }}>
          <QRCodeCanvas
            id="hidden-qr-canvas"
            value={pollDetails.url_votacion}
            size={200}
            level="H"
            includeMargin={true}
          />
        </div>
      )}
    </div>
  )
}