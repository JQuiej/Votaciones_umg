// src/app/dashboard/polls/[id]/page.tsx
'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image' // Importar Image de Next.js
import { supabase } from '../../../../lib/supabaseClient'
import { QRCodeCanvas as QRCode } from 'qrcode.react'
import html2canvas from 'html2canvas'
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

interface ResultOption {
  name: string;
  count: number;
  url_imagen?: string | null;
}

interface ResultQuestionData {
  id_pregunta: number;
  texto_pregunta: string;
  options: ResultOption[];
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

interface AssignedJudge {
  id_juez: number;
  nombre_completo: string;
  url_imagen: string | null;
  codigo_unico: string; // <-- Usaremos este para el QR
  portalLink: string; // <-- Nueva propiedad para la URL del portal
}

export default function PollDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const pollId = Number(id)

  const [poll, setPoll] = useState<PollDetail | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assignedJudges, setAssignedJudges] = useState<AssignedJudge[]>([]);

  const [newStatus, setNewStatus] = useState<string>('pendiente')
  const [saving, setSaving] = useState(false)
  const statusOptions = ['activa', 'finalizada', 'inactiva'] // Opciones de estado más comunes
  
  useEffect(() => {
    if (isNaN(pollId)) {
      setError("ID de encuesta no válido.");
      setLoading(false);
      return;
    }

    const fetchPollData = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user.id) {
        router.replace('/auth/login');
        return;
      }

      const { data: pd, error: pe } = await supabase
        .from('encuestas')
        .select('id_encuesta,id_tipo_votacion,titulo,descripcion,estado,url_votacion,codigo_acceso')
        .eq('id_encuesta', pollId)
        .single();

      if (pe || !pd) {
        setError(pe?.message ?? 'Encuesta no encontrada');
        setLoading(false);
        return;
      }
      setPoll(pd);
      setNewStatus(pd.estado);

      // Si la encuesta es de tipo "Proyectos" (ID 3), carga los jueces
if (pd.id_tipo_votacion === 4) {
        const { data: judgesData, error: judgesError } = await supabase
          .from('encuesta_jueces')
          .select(`
            jueces (id_juez, nombre_completo, url_imagen, codigo_unico)
          `)
          .eq('id_encuesta', pollId);

        if (judgesError) {
          console.error("Error al cargar jueces:", judgesError.message);
        } else if (judgesData) {
          const judgesWithLinks = judgesData.map((item: any) => {
            const judge = item.jueces;
            // --- CAMBIO CLAVE ---
            // Ahora la URL apunta a /vote y pasa el código único como parámetro
            const portalLink = `${window.location.origin}/vote?code=${judge.codigo_unico}`;
            return {
              id_juez: judge.id_juez,
              nombre_completo: judge.nombre_completo,
              url_imagen: judge.url_imagen,
              codigo_unico: judge.codigo_unico,
              portalLink: portalLink, // Esta URL se usará en el QR
            };
          });
          setAssignedJudges(judgesWithLinks);
        }
      }

      const { data: qs, error: qe } = await supabase
        .from('preguntas_encuesta')
        .select('id_pregunta,texto_pregunta,url_imagen')
        .eq('id_encuesta', pollId)
        .order('id_pregunta', { ascending: true });

      if (qe) { setError(qe.message); setLoading(false); return; }

      const loaded: Question[] = [];
      for (const q of qs || []) {
        const { data: opts, error: oe } = await supabase.from('opciones_pregunta').select('id_opcion,texto_opcion,url_imagen').eq('id_pregunta', q.id_pregunta).order('id_opcion', { ascending: true });
        if (oe) { setError(oe.message); setLoading(false); return; }
        loaded.push({ ...q, opciones: opts || [] });
      }
      setQuestions(loaded);
      setLoading(false);
    };
    
    fetchPollData();
  }, [pollId, router]);

  const [data, setData] = useState<any[]>([]); // Para guardar los resultados de los votos
  const shareableResultRef = useRef<HTMLDivElement>(null); // Para la imagen a compartir

  // Después de tu useEffect y antes de handleStatusChange
// 1. Reemplaza esta función
// Reemplaza tu función showWinnerModal con esta:
const showWinnerModal = (processedData: ResultQuestionData[]) => {
    if (!processedData || processedData.length === 0 || !poll) return;
    const isProjectPoll = poll.id_tipo_votacion === 4;

    const resultsByQuestionHtml = processedData.map(questionData => {
      const winner = questionData.options[0];
      if (!winner) return '';

      const resultsHtml = questionData.options.map((opt, index) => `
        <li class="${styles.resultsLi}">
          <span class="${styles.rankNumber}">${index + 1}.</span>
          ${opt.url_imagen ? `<img src="${opt.url_imagen}" alt="${opt.name}" class="${styles.resultsImg}" />` : ''}
          <span class="${styles.resultsName}">${opt.name}</span>
          <span class="${styles.resultsCount}">
            ${isProjectPoll ? `${opt.count.toFixed(2)} pts` : `${opt.count} votos`}
          </span>
        </li>`).join('');

      return `
        <div class="${styles.questionResultBlock}">
          <h3 class="${styles.questionResultTitle}">${isProjectPoll ? "Ranking de Proyectos" : questionData.texto_pregunta}</h3>
          <ol class="${styles.resultsOl}">${resultsHtml}</ol>
        </div>
      `;
    }).join(`<hr class="${styles.questionSeparator}" />`);

    Swal.fire({
      title: `<span class="${styles.winnerTitle}"> ¡Resultados Finales! </span>`,
      html: `<p class="${styles.pollTitleModal}">Encuesta: "${poll.titulo}"</p>${resultsByQuestionHtml}`,
      confirmButtonText: 'Compartir Resultados como Imagen',
      showCloseButton: true,
      width: '600px',
      }).then((result) => { if (result.isConfirmed) { handleShareResults(); } });
};

// REEMPLAZA TU FUNCIÓN handleShareResults CON ESTA:
const handleShareResults = async () => {
        const elementToCapture = shareableResultRef.current;
        if (!elementToCapture) {
            Swal.fire('Error', 'No se pudo generar la imagen.', 'error');
            return;
        }
        
        Swal.fire({ title: 'Generando imagen...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        try {
            const canvas = await html2canvas(elementToCapture, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            const dataUrl = canvas.toDataURL('image/png');
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], 'resultados-encuesta.png', { type: 'image/png' });
            
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: `Resultados de: ${poll!.titulo}`,
                    text:  ` ¡Consulta los resultados de la encuesta!`,
                    files: [file],
                });
                Swal.close();
            } else {
                const link = document.createElement('a');
                link.download = 'resultados-encuesta.png';
                link.href = dataUrl;
                link.click();
                Swal.fire('Descargado', 'Imagen de resultados guardada.', 'success');
            }
        } catch (err) {
            console.error('Error al generar la imagen:', err);
            Swal.fire('Error', 'No se pudo crear la imagen para compartir.', 'error');
        }
    };

// 3. Reemplaza esta función
// Reemplaza tu función handleShowResults con esta:
const handleShowResults = () => {
  const loadAndShow = async () => {
    if (!poll) return;
    Swal.fire({ title: 'Generando resultados...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const { id_encuesta: pollId, id_tipo_votacion } = poll;

    // --- LÓGICA ESPECIAL PARA PROYECTOS (ID = 4) ---
    if (id_tipo_votacion === 4) {
      const { data: projects, error: pErr } = await supabase.from('preguntas_encuesta').select('id_pregunta, texto_pregunta, url_imagen').eq('id_encuesta', pollId);
      if (pErr) { Swal.fire('Error', 'No se pudieron cargar los proyectos.', 'error'); return; }

      const { data: judges, error: jErr } = await supabase.from('encuesta_jueces').select('jueces(id_juez)').eq('id_encuesta', pollId);
      if (jErr) { Swal.fire('Error', 'No se pudieron cargar los jueces.', 'error'); return; }

      const { data: votes, error: vErr } = await supabase.from('votos_respuestas').select('id_pregunta, valor_puntuacion, id_juez').eq('id_encuesta', pollId);
      if (vErr || !votes || votes.length === 0) {
        Swal.fire('Sin Votos', 'Aún no hay votos registrados para esta encuesta.', 'info');
        return;
      }

      const assignedJudges = judges?.map((j: any) => j.jueces).flat().filter(Boolean) || [];
      
      const projectOptions: ResultOption[] = projects!.map(p => {
        const projectVotes = votes.filter(v => v.id_pregunta === p.id_pregunta);
        const judgeVotes = projectVotes.filter(v => v.id_juez !== null);
        const publicVotes = projectVotes.filter(v => v.id_juez === null);

        const judgeScores = assignedJudges.map((judge: any) => {
            const vote = judgeVotes.find(v => v.id_juez === judge.id_juez);
            return vote ? vote.valor_puntuacion || 0 : 0;
        });

        const publicSum = publicVotes.reduce((acc, v) => acc + (v.valor_puntuacion || 0), 0);
        const publicScore = publicVotes.length > 0 ? (publicSum / publicVotes.length) : 0;
        const totalJudgeScore = judgeScores.reduce((acc, score) => acc + score, 0);
        const totalScore = totalJudgeScore + publicScore;

        // Se usa 'count' para mantener la estructura, pero representa el puntaje total
        return { name: p.texto_pregunta, count: totalScore, url_imagen: p.url_imagen };
      });

      projectOptions.sort((a, b) => b.count - a.count);

      // Creamos la estructura que espera el modal
      const finalResults: ResultQuestionData[] = [{
        id_pregunta: pollId,
        texto_pregunta: "Resultados Finales de Proyectos",
        options: projectOptions,
      }];

      setData(finalResults);
      showWinnerModal(finalResults);
      return;
    }

    // --- LÓGICA EXISTENTE PARA OTROS TIPOS DE ENCUESTA (Candidatas, etc.) ---
    const { data: qs, error: qe } = await supabase.from('preguntas_encuesta').select('id_pregunta, texto_pregunta, url_imagen').eq('id_encuesta', pollId).order('id_pregunta', { ascending: true });
    if (qe || !qs) { Swal.fire('Error', 'No se pudieron cargar las preguntas.', 'error'); return; }

    const questionIds = qs.map(q => q.id_pregunta);
    const { data: opts, error: optsErr } = await supabase.from('opciones_pregunta').select('id_opcion, texto_opcion, url_imagen, id_pregunta').in('id_pregunta', questionIds);
    if (optsErr || !opts) { Swal.fire('Error', 'No se pudieron cargar las opciones.', 'error'); return; }

    const { data: votes, error: vErr } = await supabase.from('votos_respuestas').select('id_pregunta, id_opcion_seleccionada').in('id_pregunta', questionIds);
    if (vErr || !votes || votes.length === 0) {
      Swal.fire('Sin Votos', 'Aún no hay votos registrados para esta encuesta.', 'info');
      return;
    }

    const results = new Map<number, ResultQuestionData>();
    qs.forEach(q => {
      const questionOptions = opts.filter(o => o.id_pregunta === q.id_pregunta).map(o => ({
        name: o.texto_opcion,
        count: votes.filter(v => v.id_opcion_seleccionada === o.id_opcion).length,
        url_imagen: o.url_imagen
      }));

      questionOptions.sort((a, b) => b.count - a.count);

      results.set(q.id_pregunta, {
        id_pregunta: q.id_pregunta,
        texto_pregunta: q.texto_pregunta,
        options: questionOptions
      });
    });
    
    const finalResults = Array.from(results.values());
    setData(finalResults);
    showWinnerModal(finalResults);
  };
  loadAndShow();
};

  const handleStatusChange = async () => {
  if (!poll || newStatus === poll.estado) return;
  setSaving(true);

  // 1. Prepara el objeto a actualizar
  const updatePayload: { estado: string; fecha_activacion?: string } = {
    estado: newStatus,
  };

  // 2. Si el nuevo estado es "activa", añade la fecha y hora actual
  if (newStatus === 'activa') {
    updatePayload.fecha_activacion = new Date().toISOString();
  }

  // 3. Envía el objeto completo a Supabase
  const { error } = await supabase
    .from('encuestas')
    .update(updatePayload) // Usa el payload dinámico
    .eq('id_encuesta', pollId);

  if (error) {
    Swal.fire('Error', 'No se pudo actualizar el estado: ' + error.message, 'error');
  } else {
    // Actualiza el estado localmente, incluyendo la nueva fecha si existe
    setPoll(p => p && { 
      ...p, 
      estado: newStatus, 
      ...(updatePayload.fecha_activacion && { fecha_activacion: updatePayload.fecha_activacion }) 
    });
    Swal.fire('¡Éxito!', `Estado actualizado a: ${newStatus.toUpperCase()}`, 'success');
  }
  setSaving(false);
};

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
          <button onClick={() => router.push(`/dashboard/realtime/${pollId}`)} className={styles.realtimeButton}>
            Votación
          </button>
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
      {/* --- INICIO DE LA NUEVA SECCIÓN PARA JUECES --- */}
      {/* --- SECCIÓN ACTUALIZADA PARA MOSTRAR JUECES Y SUS QR --- */}
      {poll.id_tipo_votacion === 4 && assignedJudges.length > 0 && (
        <div className={styles.judgesSection}>
          <h2 className={styles.judgesTitle}>Acceso para Jueces</h2>
          <div className={styles.judgesContainer}>
            {assignedJudges.map(judge => (
              <div key={judge.id_juez} className={styles.judgeCard}>
                <div className={styles.judgeInfo}>
                  {judge.url_imagen && (
                    <Image src={judge.url_imagen} alt={judge.nombre_completo} width={50} height={50} className={styles.judgeAvatar} />
                  )}
                  <span>{judge.nombre_completo}</span>
                </div>
                
                <div className={styles.judgeQr}>
                  {/* --- CAMBIO CLAVE: Usa portalLink en lugar de votingLink --- */}
                  <QRCode value={judge.portalLink} size={120} level="H" />
                </div>
                
                <div className={styles.judgeLinkContainer}>
                  {/* Muestra el código único del juez para copiarlo manualmente si es necesario */}
                  <input type="text" value={judge.codigo_unico} readOnly className={styles.judgeLinkInput} onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(judge.codigo_unico);
                      Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: '¡Código copiado!',
                        showConfirmButton: false,
                        timer: 1500
                      });
                    }}
                    className={styles.copyButton}
                  >
                    Copiar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* --- DIV OCULTO ACTUALIZADO --- */}
      {data.length > 0 && poll && (
        <div ref={shareableResultRef} className={styles.shareableResultsContainer}>
            <div className={styles.shareableHeader}>
              <h2>Resultados Finales</h2>
            </div>
            <p className={styles.shareablePollTitle}>Encuesta: &quot;{poll.titulo}&quot;</p>
            
            {data.map(questionData => (
              <div key={questionData.id_pregunta} className={styles.shareableQuestionBlock}>
                <h3 className={styles.shareableQuestionTitle}>{questionData.texto_pregunta}</h3>
                {questionData.options.length > 0 && (
                  <div className={styles.shareableWinner}>
                    <p>El ganador es: <strong>{questionData.options[0].name}</strong></p>
                  </div>
                )}
                <ol className={styles.shareableList}>
                  {questionData.options.map((opt: ResultOption, index: number) => (
                    <li key={index}>
                      <span className={styles.shareableRank}>{index + 1}.</span>
                      {opt.url_imagen && <img src={opt.url_imagen} alt={opt.name} className={styles.shareableImg} crossOrigin="anonymous" />}
                      <span className={styles.shareableName}>{opt.name}</span>
                      <span className={styles.shareableCount}>
                        {poll.id_tipo_votacion < 3 ? `${opt.count} votos` : `${opt.count.toFixed(2)} pts`}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}