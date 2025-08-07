'use client'

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import Swal from 'sweetalert2';
import html2canvas from 'html2canvas';
import { Share2, PartyPopper, Crown } from 'lucide-react';
import { supabase } from '../../../../lib/supabaseClient';
import Confetti from 'react-confetti';
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
  const router = useRouter();
  
  const [pollDetails, setPollDetails] = useState<PollDetails | null>(null);
  const [view, setView] = useState<'bar' | 'pie'>('bar');
  const [data, setData] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalVotes, setTotalVotes] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  
  const shareableResultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pollIdFromUrl = parseInt(params.id as string, 10);
    if (isNaN(pollIdFromUrl)) {
      setError("El ID de la encuesta no es válido."); setLoading(false); return;
    }
    
    const loadData = async (isInitialLoad = false) => {
      if (isInitialLoad) setLoading(true);

      const { data: poll, error: pollErr } = await supabase.from('encuestas').select('id_encuesta, id_tipo_votacion, titulo, estado, url_votacion, codigo_acceso').eq('id_encuesta', pollIdFromUrl).single();
      if (pollErr || !poll) {
        setError('No se encontró la encuesta o no tienes permiso para verla.'); setLoading(false); return;
      }
      setPollDetails(poll);

      const { id_encuesta: pollId, id_tipo_votacion } = poll;
      const { data: qs, error: qe } = await supabase.from('preguntas_encuesta').select('id_pregunta, texto_pregunta, url_imagen').eq('id_encuesta', pollId).order('id_pregunta', { ascending: true });
      if (qe || !qs) { if(isInitialLoad) { setError('Error al cargar preguntas.'); setLoading(false); } return; }

      const questionIds = qs.map(q => q.id_pregunta);
      const { data: opts, error: optsErr } = await supabase.from('opciones_pregunta').select('id_opcion, texto_opcion, url_imagen, id_pregunta').in('id_pregunta', questionIds);
      if (optsErr || !opts) { if(isInitialLoad) { setError('Error al cargar opciones.'); setLoading(false); } return; }
      
      const { data: votes, error: vErr } = await supabase.from('votos_respuestas').select('id_pregunta, id_opcion_seleccionada, valor_puntuacion, orden_ranking').in('id_pregunta', questionIds);
      if (vErr) { if(isInitialLoad) { setError(vErr.message); setLoading(false); } return; }
      
      setTotalVotes(votes?.length || 0);

      const results = new Map<number, QuestionData>();
      const optionMap = new Map(opts.map(o => [o.id_opcion, o.texto_opcion]));

      if (id_tipo_votacion === 1) {
        const consolidatedOptions = new Map<number, OptionCount>();
        opts.forEach(opt => consolidatedOptions.set(opt.id_opcion, { name: opt.texto_opcion, count: 0, url_imagen: opt.url_imagen }));
        votes?.forEach(v => { const opt = consolidatedOptions.get(v.id_opcion_seleccionada!); if(opt) opt.count++; });
        results.set(0, { id_pregunta: 0, texto_pregunta: "Resultados Consolidados", options: Array.from(consolidatedOptions.values()) });
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
            else if (id_tipo_votacion === 3) { option.sumOfValues! += v.valor_puntuacion!; option.voteCount!++; option.count = option.voteCount! > 0 ? parseFloat((option.sumOfValues! / option.voteCount!).toFixed(2)) : 0; }
            else if (id_tipo_votacion === 4) { option.sumOfValues! += v.orden_ranking!; option.voteCount!++; option.count = option.voteCount! > 0 ? parseFloat((option.sumOfValues! / option.voteCount!).toFixed(2)) : 0; }
          }
        });
      }
      results.forEach(questionData => {
        if (id_tipo_votacion === 4) { questionData.options.sort((a, b) => a.count - b.count); }
        else { questionData.options.sort((a, b) => b.count - a.count); }
      });
      setData(Array.from(results.values()));
      
      if (isInitialLoad) {
        setLoading(false);
      }
    };



    // --- Lógica de Realtime ---
    const channel = supabase.channel(`realtime-poll-${pollIdFromUrl}`);

    const init = async () => {
      // 1. Hacemos la carga inicial de todos los datos.
      await loadData(true);

      // 2. Después de la carga, configuramos la suscripción si la encuesta está activa.
      const { data: pollData } = await supabase.from('encuestas').select('estado, id_encuesta').eq('id_encuesta', pollIdFromUrl).single();
      if (pollData?.estado === 'activa') {
        const { data: qs } = await supabase.from('preguntas_encuesta').select('id_pregunta').eq('id_encuesta', pollData.id_encuesta);
        const questionIds = qs ? qs.map(q => q.id_pregunta) : [];

        if (questionIds.length > 0) {
          channel.on(
            'postgres_changes',
            { 
              event: 'INSERT', 
              schema: 'public', 
              table: 'votos_respuestas',
              // Filtro eficiente: solo escuchamos votos de las preguntas de esta encuesta
              filter: `id_pregunta=in.(${questionIds.join(',')})`
            },
            (payload) => {
              console.log('¡Nuevo voto recibido!', payload);
              loadData(false); // Recargamos los datos para actualizar la vista
            }
          ).subscribe();
        }
      }
    };


    
    init();

    // 3. Limpieza: Nos aseguramos de cancelar la suscripción al salir de la página.
    return () => {
      supabase.removeChannel(channel);
    };

  }, [params.id]);

  const showWinnerModal = () => {
    if (!data || data.length === 0 || data[0].options.length === 0) return;
    const winner = data[0].options[0];
    const pollType = pollDetails?.id_tipo_votacion;
    const isRanking = pollType === 4;
    const resultsHtml = data[0].options.map((opt, index) => `
      <li class="${styles.resultsLi}">
        <span class="${styles.rankNumber}">${index + 1}.</span>
        ${opt.url_imagen ? `<img src="${opt.url_imagen}" alt="${opt.name}" class="${styles.resultsImg}" />` : ''}
        <span class="${styles.resultsName}">${opt.name}</span>
        <span class="${styles.resultsCount}">${pollType === 1 || pollType === 2 ? `${opt.count} votos` : `${opt.count.toFixed(2)} pts`}</span>
      </li>`).join('');
    Swal.fire({
      title: `<span class="${styles.winnerTitle}"><Crown size={28} /> ¡Resultados Finales! <Crown size={28} /></span>`,
      html: `<p class="${styles.pollTitleModal}">Encuesta: "${pollDetails?.titulo}"</p>
        <p class="${styles.winnerText}">El ganador es:</p>
        <h2 class="${styles.winnerName}">${winner.name}</h2>
        <p class="${styles.winnerTextSmall}">con ${pollType === 1 || pollType === 2 ? `${winner.count} votos` : `${winner.count.toFixed(2)} de puntuación promedio`}${isRanking ? ' (ranking más bajo)' : ''}</p>
        <hr /><h3 class="${styles.fullRankingTitle}">Clasificación Completa</h3>
        <ol class="${styles.resultsOl}">${resultsHtml}</ol>`,
      confirmButtonText: 'Compartir Resultados como Imagen',
      showCloseButton: true,
      width: '500px',
    }).then((result) => { if (result.isConfirmed) { handleShareResults(); } });
  };

  const handleEndPoll = async () => {
    if (!pollDetails) return;
    const result = await Swal.fire({
      title: '¿Finalizar la encuesta?', text: "Una vez finalizada, ya no se aceptarán más votos.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'Sí, finalizar', cancelButtonText: 'Cancelar'
    });
    if (result.isConfirmed) {
      const { error } = await supabase.from('encuestas').update({ estado: 'finalizada' }).eq('id_encuesta', pollDetails.id_encuesta);
      if (error) { Swal.fire('Error', `No se pudo finalizar la encuesta: ${error.message}`, 'error'); }
      else {
        setPollDetails(p => p ? { ...p, estado: 'finalizada' } : null);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 8000);
        showWinnerModal();
      }
    }
  };

  const handleShareResults = async () => {
    if (!shareableResultRef.current) {
      Swal.fire('Error', 'No se pudo generar la imagen de resultados.', 'error');
      return;
    }

    // 1) Clona TODO el contenedor (clases + contenido)
    const original = shareableResultRef.current;
    const clone = original.cloneNode(true) as HTMLElement;

    // 2) Añade la clase que hace visible + centra
    clone.classList.add(styles.shareableResultsVisible);

    // 3) Forza estilos inline para off-screen
    const { width, height } = original.getBoundingClientRect();
    Object.assign(clone.style, {
      position:   'absolute',
      top:        '-9999px',
      left:       '0px',
      display:    'block',
      visibility: 'visible',
      opacity:    '1',
      width:      `${width}px`,
      height:     `${height}px`,
      background: '#ffffff',
    });

    document.body.appendChild(clone);

    try {
      // 4) Pre-carga imágenes internas como data-URLs (evita CORS)
      const imgs = Array.from(clone.querySelectorAll('img'));
      await Promise.all(imgs.map(async img => {
        if (img.src && !img.src.startsWith('data:')) {
          const res  = await fetch(img.src);
          const blob = await res.blob();
          img.src     = await new Promise<string>(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      }));

      // 5) Pequeño delay para asegurar repaint
      await new Promise(r => setTimeout(r, 100));

      // 6) Captura con html2canvas
      const canvas = await html2canvas(clone, {
        useCORS:         true,
        backgroundColor: '#ffffff',
        scale:           2.5,
        width, height,
      });
      const dataUrl = canvas.toDataURL('image/png');

      // 7) Comparte o descarga
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'resultados-encuesta.png', { type: 'image/png' });
      const winner = data[0].options[0];
      const shareData = {
        title: `Resultados de: ${pollDetails!.titulo}`,
        text:  `🏆 ¡El ganador es: ${winner.name}!`,
        files: [file],
      };
      Swal.close();

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share(shareData);
      } else {
        const link = document.createElement('a');
        link.download = 'resultados-encuesta.png';
        link.href     = dataUrl;
        link.click();
        Swal.fire('Descargado', 'Imagen de resultados guardada.', 'success');
      }

    } catch (err) {
      console.error('Error generando imagen:', err);
      Swal.fire('Error', 'No se pudo crear la imagen.', 'error');
    } finally {
      document.body.removeChild(clone);
    }
  };
  
  const handleShare = () => {
    if (!pollDetails) return;
    const canvas = document.getElementById('hidden-qr-canvas') as HTMLCanvasElement;
    if (!canvas) { Swal.fire('Error', 'No se pudo generar el código QR.', 'error'); return; }
    const qrImageUrl = canvas.toDataURL('image/png');
    Swal.fire({
      title: 'Comparte tu Encuesta',
      html: `<div class="${styles.shareModalContent}">
          <p>Los participantes pueden escanear el código QR o usar el enlace y el código de acceso.</p>
          <div class="${styles.qrContainerModal}"><img src="${qrImageUrl}" alt="Código QR" style="width: 200px; height: 200px;" /></div>
          <div class="${styles.shareInfo}">
            <strong>Enlace:</strong>
            <input type="text" value="${pollDetails.url_votacion}" readonly class="${styles.shareInput}" />
            <strong>Código de Acceso:</strong>
            <input type="text" value="${pollDetails.codigo_acceso}" readonly class="${styles.shareInput}" />
          </div></div>`,
      showCloseButton: true, showConfirmButton: false, width: '400px',
    });
  };

  if (loading) return <p className={styles.info}>Cargando resultados...</p>;
  if (error) return <p className={styles.error}>{error}</p>;
  if (!pollDetails) return <p className={styles.info}>No se encontraron detalles de la encuesta.</p>;

  const { titulo: pollTitle, id_tipo_votacion: pollType, estado } = pollDetails;
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28FDF', '#FF6B6B', '#5A9BD5', '#FFD700', '#8A2BE2', '#DC143C', '#228B22', '#FFDAB9'];
  
  const renderCharts = () => {
    return data.map(qData => {
      const chartHeight = qData.options.length > 5 ? 400 : 300;
      return (
        <div key={qData.id_pregunta} className={styles.chartBlock}>
          {(data.length > 1 || pollType !== 1) && ( <h2 className={styles.questionTitle}>{qData.texto_pregunta}</h2> )}
          {qData.url_imagen && ( <Image src={qData.url_imagen} alt={`Imagen para la pregunta: ${qData.texto_pregunta}`} width={200} height={150} className={styles.questionImg} style={{ objectFit: 'contain' }} /> )}
          {pollType === 4 && ( <p className={styles.rankingInfo}>Menor valor = mejor ranking</p> )}
          {(pollType === 1 || pollType === 2) && view === 'pie' ? (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <PieChart>
                <Pie data={qData.options} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                  {qData.options.map((_, i) => (<Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />))}
                </Pie>
                <Tooltip formatter={(value: number) => `${value} votos`} /><Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={qData.options}>
                <XAxis dataKey="name" interval={0} angle={qData.options.length > 3 ? -30 : 0} textAnchor={qData.options.length > 3 ? "end" : "middle"} height={qData.options.length > 3 ? 100 : 40} />
                <YAxis allowDecimals={pollType === 3 || pollType === 4} label={{ value: pollType === 1 || pollType === 2 ? 'Número de Votos' : pollType === 3 ? 'Puntuación Promedio' : 'Promedio de Ranking', angle: -90, position: 'insideLeft' }} domain={pollType === 3 ? [0, 10] : [0, 'auto']} />
                <Tooltip formatter={(value: number) => pollType === 1 || pollType === 2 ? `${value} votos` : `${value.toFixed(2)} (Promedio)`} />
                <Bar dataKey="count" fill={pollType === 1 ? '#8884d8' : pollType === 2 ? '#4CAF50' : pollType === 3 ? '#20B2AA' : '#FF5733'} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className={styles.optionList}>
            {qData.options.map((opt, i) => (
              <div key={i} className={styles.optionItem}>
                {opt.url_imagen && (<Image src={opt.url_imagen} alt={opt.name} width={50} height={50} className={styles.optionImg} style={{ objectFit: 'cover' }} />)}
                <span className={styles.optionText}>{opt.name}:{' '}{pollType === 1 || pollType === 2 ? `${opt.count.toString()} votos` : `${opt.count.toFixed(2)} (Prom.)`}</span>
              </div>
            ))}
          </div>
        </div>
      );
    });
  };

  return (
    <div className={styles.container}>
      {showConfetti && <Confetti
        width={typeof window !== 'undefined' ? window.innerWidth : 0}
        height={typeof window !== 'undefined' ? window.innerHeight : 0}
       className={styles.confettiCanvas}
      />}

      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>←</button>
        {pollTitle && <h1 className={styles.mainTitle}>{pollTitle}</h1>}
        <div className={styles.headerActions}>
          <button onClick={handleShare} className={styles.shareButton} title="Compartir Encuesta">
            <Share2 size={20} /> Compartir
          </button>
          <button onClick={handleEndPoll} className={styles.endButton} title="Finalizar Encuesta" disabled={estado !== 'activa'}>
            <PartyPopper size={20} /> Finalizar
          </button>
        </div>
      </div>
      
      <div className={styles.totalVotesPanel}>Votos Totales: <span>{totalVotes}</span></div>

      <h2 className={styles.subTitle}>Resultados en tiempo real</h2>
      {(pollType === 1 || pollType === 2) && (
        <div className={styles.toggleGroup}>
          <button className={view === 'bar' ? styles.toggleActive : styles.toggleButton} onClick={() => setView('bar')}>Barras</button>
          <button className={view === 'pie' ? styles.toggleActive : styles.toggleButton} onClick={() => setView('pie')}>Pastel</button>
        </div>
      )}
      {data.length > 0 ? renderCharts() : <p className={styles.info}>Esperando los primeros votos...</p>}

      {pollDetails && (<div style={{ display: 'none' }}><QRCodeCanvas id="hidden-qr-canvas" value={pollDetails.url_votacion} size={200} level="H" includeMargin={true} /></div>)}

      {data.length > 0 && pollDetails && (
        <div ref={shareableResultRef} className={styles.shareableResultsContainer}>
          <div className={styles.shareableHeader}>
            <Crown size={28} />
            <h2>Resultados Finales</h2>
            <Crown size={28} />
          </div>
          <p className={styles.shareablePollTitle}>Encuesta: &quot;{pollDetails.titulo}&quot;</p>
          <div className={styles.shareableWinner}>
            <p>El ganador es:</p>
            <h3>{data[0].options[0].name}</h3>
          </div>
          <ol className={styles.shareableList}>
            {data[0].options.map((opt, index) => (
              <li key={index}>
                <span className={styles.shareableRank}>{index + 1}.</span>
                <span className={styles.shareableName}>{opt.name}</span>
                <span className={styles.shareableCount}>
                  {pollType === 1 || pollType === 2 ? `${opt.count} votos` : `${opt.count.toFixed(2)} pts`}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}