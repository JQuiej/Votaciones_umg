// src/app/dashboard/polls/[id]/page.tsx
'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image' // Importar Image de Next.js
import { supabase } from '../../../../lib/supabaseClient'
import { QRCodeCanvas as QRCode } from 'qrcode.react'
import Swal from 'sweetalert2' // Importar SweetAlert2
import styles from './page.module.css'
import { Edit, Trash2, BarChart2, Award, Crown } from 'lucide-react';
import { toPng } from 'html-to-image';

interface PollDetail {
  id_encuesta: number
  id_tipo_votacion: number
  titulo: string
  descripcion: string | null
  estado: string
  url_votacion: string
  codigo_acceso: string
}

interface Question {
  id_pregunta: number
  texto_pregunta: string
  url_imagen: string | null
  opciones: {
    id_opcion: number
    texto_opcion: string
    url_imagen: string | null
  }[]
}

export default function PollDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const pollId = Number(id)

  const [poll, setPoll] = useState<PollDetail | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newStatus, setNewStatus] = useState<string>('pendiente')
  const [saving, setSaving] = useState(false)
  const statusOptions = ['activa', 'finalizada', 'inactiva'] // Opciones de estado más comunes

  useEffect(() => {
    const fetchPollData = async () => {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user.id) {
        router.replace('/auth/login')
        return
      }

      const { data: pd, error: pe } = await supabase
        .from('encuestas')
        .select('id_encuesta,id_tipo_votacion,titulo,descripcion,estado,url_votacion,codigo_acceso')
        .eq('id_encuesta', pollId)
        .single()
      if (pe || !pd) {
        setError(pe?.message ?? 'Encuesta no encontrada')
        setLoading(false)
        return
      }
      setPoll(pd)
      setNewStatus(pd.estado)

      const { data: qs, error: qe } = await supabase
        .from('preguntas_encuesta')
        .select('id_pregunta,texto_pregunta,url_imagen')
        .eq('id_encuesta', pollId)
        .order('id_pregunta', { ascending: true })
      if (qe) {
        setError(qe.message); setLoading(false); return
      }

      const loaded: Question[] = []
      for (const q of qs || []) {
        const { data: opts, error: oe } = await supabase
          .from('opciones_pregunta')
          .select('id_opcion,texto_opcion,url_imagen')
          .eq('id_pregunta', q.id_pregunta)
          .order('id_opcion', { ascending: true })
        if (oe) {
          setError(oe.message); setLoading(false); return
        }
        loaded.push({ ...q, opciones: opts || [] })
      }
      setQuestions(loaded)
      setLoading(false)
    }
    fetchPollData()
  }, [pollId, router])

  const [data, setData] = useState<any[]>([]); // Para guardar los resultados de los votos
  const shareableResultRef = useRef<HTMLDivElement>(null); // Para la imagen a compartir

  // Después de tu useEffect y antes de handleStatusChange
// 1. Reemplaza esta función
const showWinnerModal = (processedData: any[]) => { // Acepta los datos como argumento
  if (!processedData || processedData.length === 0 || processedData[0].options.length === 0 || !poll) return;

  const winner = processedData[0].options[0]; // Usa los datos del argumento
  const pollType = poll.id_tipo_votacion;
  const isRanking = pollType === 4;

  const resultsHtml = processedData[0].options.map((opt: any, index: number) => `
    <li class="${styles.resultsLi}">
      <span class="${styles.rankNumber}">${index + 1}.</span>
      ${opt.url_imagen ? `<img src="${opt.url_imagen}" alt="${opt.name}" class="${styles.resultsImg}" />` : ''}
      <span class="${styles.resultsName}">${opt.name}</span>
      <span class="${styles.resultsCount}">
        ${pollType === 1 || pollType === 2 ? `${opt.count} votos` : `${opt.count.toFixed(2)} pts`}
      </span>
    </li>
  `).join('');

  Swal.fire({
    title: `<span class="${styles.winnerTitle}"><Crown size={28} /> ¡Resultados Finales! <Crown size={28} /></span>`,
    html: `
      <p class="${styles.pollTitleModal}">Encuesta: "${poll.titulo}"</p>
      <p class="${styles.winnerText}">El ganador es:</p>
      <h2 class="${styles.winnerName}">${winner.name}</h2>
      <p class="${styles.winnerTextSmall}">con ${pollType === 1 || pollType === 2 ? `${winner.count} votos` : `${winner.count.toFixed(2)} de puntuación promedio`}${isRanking ? ' (ranking más bajo)' : ''}</p>
      <hr />
      <h3 class="${styles.fullRankingTitle}">Clasificación Completa</h3>
      <ol class="${styles.resultsOl}">${resultsHtml}</ol>
    `,
    confirmButtonText: 'Compartir Resultados como Imagen',
    showCloseButton: true,
    width: '500px',
  }).then((result) => { 
    if (result.isConfirmed) { 
      // Pasamos los datos también a la función de compartir
      handleShareResults(processedData); 
    } 
  });
};

// 2. Reemplaza esta función
const handleShareResults = async (processedData: any[]) => { // Acepta los datos como argumento
  if (!shareableResultRef.current || !poll) {
    Swal.fire('Error', 'No se pudo generar la imagen de resultados.', 'error'); return;
  }
  try {
    const dataUrl = await toPng(shareableResultRef.current, { cacheBust: true, backgroundColor: 'white', pixelRatio: 2 });
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], 'resultados-encuesta.png', { type: 'image/png' });
    
    // Usa los datos del argumento para obtener el ganador
    const winner = processedData[0].options[0];
    const pollTitle = poll.titulo;
    const shareData = { title: `Resultados de: ${pollTitle}`, text: `🏆 ¡Resultados de "${pollTitle}"!\n\nEl ganador es: ${winner.name}`, files: [file] };
    
    if (navigator.canShare && navigator.canShare(shareData)) {
      await navigator.share(shareData);
    } else {
      const link = document.createElement('a');
      link.download = 'resultados-encuesta.png';
      link.href = dataUrl;
      link.click();
      Swal.fire('Descargado', 'La imagen de resultados se ha descargado.', 'success');
    }
  } catch (err) {
    console.error('Error al generar o compartir la imagen:', err);
    Swal.fire('Error', 'Hubo un problema al crear la imagen de resultados.', 'error');
  }
};
  

// 3. Reemplaza esta función
const handleShowResults = () => {
  const loadAndShow = async () => {
    if (!poll) return;
    Swal.fire({ title: 'Generando resultados...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const { id_encuesta: pollId, id_tipo_votacion } = poll;
    const { data: qs, error: qe } = await supabase.from('preguntas_encuesta').select('id_pregunta, texto_pregunta, url_imagen').eq('id_encuesta', pollId).order('id_pregunta', { ascending: true });
    if (qe || !qs) { Swal.fire('Error', 'No se pudieron cargar las preguntas.', 'error'); return; }

    const questionIds = qs.map(q => q.id_pregunta);
    const { data: opts, error: optsErr } = await supabase.from('opciones_pregunta').select('id_opcion, texto_opcion, url_imagen, id_pregunta').in('id_pregunta', questionIds);
    if (optsErr || !opts) { Swal.fire('Error', 'No se pudieron cargar las opciones.', 'error'); return; }

    const { data: votes, error: vErr } = await supabase.from('votos_respuestas').select('id_pregunta, id_opcion_seleccionada, valor_puntuacion, orden_ranking').in('id_pregunta', questionIds);
    if (vErr) { Swal.fire('Error', 'No se pudieron cargar los votos.', 'error'); return; }
    if (!votes || votes.length === 0) {
      Swal.fire('Sin Votos', 'Aún no hay votos registrados para esta encuesta.', 'info');
      return;
    }

    const results = new Map<number, any>();
    const optionMap = new Map(opts.map(o => [o.id_opcion, o.texto_opcion]));

    if (id_tipo_votacion === 1) {
      const consolidatedOptions = new Map();
      opts.forEach(opt => consolidatedOptions.set(opt.id_opcion, { name: opt.texto_opcion, count: 0, url_imagen: opt.url_imagen }));
      votes.forEach(v => { const opt = consolidatedOptions.get(v.id_opcion_seleccionada!); if(opt) opt.count++; });
      results.set(0, { id_pregunta: 0, texto_pregunta: "Resultados Consolidados", options: Array.from(consolidatedOptions.values()) });
    } else {
      qs.forEach(q => {
        const questionOptions = opts.filter(o => o.id_pregunta === q.id_pregunta).map(o => ({ name: o.texto_opcion, count: 0, url_imagen: o.url_imagen, voteCount: 0, sumOfValues: 0 }));
        results.set(q.id_pregunta, { id_pregunta: q.id_pregunta, texto_pregunta: q.texto_pregunta, url_imagen: q.url_imagen, options: questionOptions });
      });
      votes.forEach(v => {
        const questionResult = results.get(v.id_pregunta!);
        if (!questionResult) return;
        const option = questionResult.options.find((o: any) => o.name === optionMap.get(v.id_opcion_seleccionada!));
        if (option) {
          if (id_tipo_votacion === 2) { option.count++; }
          else if (id_tipo_votacion === 3) { option.sumOfValues! += v.valor_puntuacion!; option.voteCount!++; option.count = option.voteCount! > 0 ? parseFloat((option.sumOfValues! / option.voteCount!).toFixed(2)) : 0; }
          else if (id_tipo_votacion === 4) { option.sumOfValues! += v.orden_ranking!; option.voteCount!++; option.count = option.voteCount! > 0 ? parseFloat((option.sumOfValues! / option.voteCount!).toFixed(2)) : 0; }
        }
      });
    }

    results.forEach(questionData => {
      if (id_tipo_votacion === 4) { questionData.options.sort((a: any, b: any) => a.count - b.count); }
      else { questionData.options.sort((a: any, b: any) => b.count - a.count); }
    });
    
    const finalResults = Array.from(results.values());
    setData(finalResults); // Todavía actualizamos el estado para la imagen

    // Pasamos los resultados calculados directamente al modal
    showWinnerModal(finalResults);
  };
  loadAndShow();
};

  const handleStatusChange = async () => {
    if (!poll || newStatus === poll.estado) return
    setSaving(true)
    const { error } = await supabase
      .from('encuestas')
      .update({ estado: newStatus })
      .eq('id_encuesta', pollId)

    if (error) {
      Swal.fire('Error', 'No se pudo actualizar el estado: ' + error.message, 'error')
    } else {
      setPoll(p => p && { ...p, estado: newStatus })
      Swal.fire('¡Éxito!', `Estado actualizado a: ${newStatus.toUpperCase()}`, 'success')
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: "Esta acción es irreversible y eliminará todos los datos de la encuesta (preguntas, opciones y votos).",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    })

    if (result.isConfirmed) {
      const { error } = await supabase
        .from('encuestas')
        .delete()
        .eq('id_encuesta', pollId)

      if (error) {
        Swal.fire('Error', 'No se pudo eliminar la encuesta: ' + error.message, 'error')
      } else {
        await Swal.fire('Eliminada', 'La encuesta ha sido eliminada.', 'success')
        router.push('/dashboard/polls')
      }
    }
  }

  if (loading) return <p className={styles.info}>Cargando encuesta…</p>
  if (error) return <p className={styles.error}>Error: {error}</p>
  if (!poll) return <p className={styles.info}>Encuesta no encontrada.</p>

  const voteUrl = typeof window !== 'undefined' ? `${window.location.origin}/vote/${poll.codigo_acceso}` : '';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>
          ← Regresar
        </button>

      </div>
      <div><h1 className={styles.title}>{poll.titulo}</h1></div>

      {poll.descripcion && (
        <p className={styles.description}>{poll.descripcion}</p>
      )}

      <div className={styles.field}>
        <label htmlFor="pollStatus">Estado:</label>
        <select id="pollStatus" value={newStatus} onChange={e => setNewStatus(e.target.value)} disabled={saving} className={styles.select}>
          {statusOptions.map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <button onClick={handleStatusChange} disabled={saving || newStatus === poll.estado} className={styles.updateStatusBtn}>
          {saving ? 'Guardando…' : 'Cambiar estado'}
        </button>
      </div>

      <div className={styles.mainContent}>
        <div className={styles.previewSection}>
          <h2 className={styles.previewTitle}>Vista del Participante</h2>
          <form className={styles.previewForm}>
            {questions.map(q => (
              <fieldset key={q.id_pregunta} className={styles.previewQuestion}>
                <legend>{q.texto_pregunta}</legend>
                {q.url_imagen && (
                  <Image src={q.url_imagen} alt={q.texto_pregunta} width={150} height={100} className={styles.questionImg} style={{ objectFit: 'contain' }} />
                )}

                {poll.id_tipo_votacion === 1 && (
                  q.opciones.map(o => (
                    <label key={o.id_opcion} className={styles.previewOption}>
                      <input type="radio" name={`q_${q.id_pregunta}`} disabled />
                      {o.url_imagen && <Image src={o.url_imagen} alt={o.texto_opcion} width={30} height={30} className={styles.previewOptionImg} />}
                      <span>{o.texto_opcion}</span>
                    </label>
                  ))
                )}
                {poll.id_tipo_votacion === 2 && (
                  q.opciones.map(o => (
                    <label key={o.id_opcion} className={styles.previewOption}>
                      <input type="checkbox" name={`q_${q.id_pregunta}`} disabled />
                      {o.url_imagen && <Image src={o.url_imagen} alt={o.texto_opcion} width={30} height={30} className={styles.previewOptionImg} />}
                      <span>{o.texto_opcion}</span>
                    </label>
                  ))
                )}
                
                {/* ----- INICIO DE LA CORRECCIÓN CON SLIDER ----- */}
                {poll.id_tipo_votacion === 3 && (
                  <div className={styles.scoringGrid}>
                    {q.opciones.map(o => (
                      <div key={o.id_opcion} className={styles.scoringItem}>
                        <label htmlFor={`score_prev_${o.id_opcion}`} className={styles.scoringOptionLabel}>
                          {o.url_imagen && <Image src={o.url_imagen} alt={o.texto_opcion} width={30} height={30} className={styles.previewOptionImg} />}
                          <span>{o.texto_opcion}</span>
                        </label>
                        <div className={styles.sliderGroup}>
                          <input type="range" id={`score_prev_${o.id_opcion}`} min={1} max={10} defaultValue={5} disabled className={styles.sliderInput} />
                          <span className={styles.sliderValue}>5</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* ----- FIN DE LA CORRECCIÓN CON SLIDER ----- */}
                {poll.id_tipo_votacion === 4 && (
                  q.opciones.map(o => (
                    <div key={o.id_opcion} className={styles.previewRank}>
                      <input type="number" min={1} max={q.opciones.length} defaultValue={1} disabled className={styles.previewNumber} />
                      {o.url_imagen && <Image src={o.url_imagen} alt={o.texto_opcion} width={30} height={30} className={styles.previewOptionImg} />}
                      <span>{o.texto_opcion}</span>
                    </div>
                  ))
                )}
              </fieldset>
            ))}
          </form>
        </div>
        <div className={styles.headerActions}>
          <button onClick={() => router.push(`/dashboard/polls/${pollId}/edit`)} className={styles.editButton}>
            Editar
          </button>
          <button onClick={handleDelete} className={styles.deleteButton}>
            Eliminar
          </button>
          <button onClick={() => router.push(`/dashboard/realtime/${pollId}`)} className={styles.realtimeButton} disabled={poll.estado !== 'activa'}>
            Votación
          </button>
          {poll.estado === 'finalizada' && (
              <button onClick={handleShowResults} className={styles.shareResultsButton}>
              Compartir Resultados
              </button>
          )}
        </div>
        <div className={styles.qrContainer}>
          <div className={styles.qrCodeWrapper}>
            {voteUrl && <QRCode value={voteUrl} size={150} level="H" />}
          </div>
          <p className={styles.accessCode}>
            Código de acceso:<br />
            <code>{poll.codigo_acceso}</code>
          </p>
          <a href={voteUrl} target="_blank" rel="noopener noreferrer" className={styles.voteLink}>
            Abrir enlace de votación
          </a>
        </div>
      </div>
      {data.length > 0 && poll && (
        <div ref={shareableResultRef} className={styles.shareableResultsContainer}>
            <div className={styles.shareableHeader}>
                <Crown size={28} />
                <h2>Resultados Finales</h2>
                <Crown size={28} />
            </div>
            <p className={styles.shareablePollTitle}>Encuesta: &quot;{poll?.titulo}&quot;</p>
            <div className={styles.shareableWinner}>
                <p>El ganador es:</p>
                <h3>{data[0].options[0].name}</h3>
            </div>
            <ol className={styles.shareableList}>
                {data[0].options.map((opt: any, index: number) => (
                <li key={index}>
                    <span className={styles.shareableRank}>{index + 1}.</span>
                    <span className={styles.shareableName}>{opt.name}</span>
                    <span className={styles.shareableCount}>
                    {poll.id_tipo_votacion === 1 || poll.id_tipo_votacion === 2 ? `${opt.count} votos` : `${opt.count.toFixed(2)} pts`}
                    </span>
                </li>
                ))}
            </ol>
        </div>
        )}
    </div>
  )
}