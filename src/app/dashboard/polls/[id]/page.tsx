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
  const showWinnerModal = (processedData: ResultQuestionData[]) => {
    if (!processedData || processedData.length === 0 || !poll) return;
    const pollType = poll.id_tipo_votacion;

    const resultsByQuestionHtml = processedData.map(questionData => {
      const winner = questionData.options[0];
      if (!winner) return '';

      const resultsHtml = questionData.options.map((opt, index) => `
        <li class="${styles.resultsLi}">
          <span class="${styles.rankNumber}">${index + 1}.</span>
          ${opt.url_imagen ? `<img src="${opt.url_imagen}" alt="${opt.name}" class="${styles.resultsImg}" />` : ''}
          <span class="${styles.resultsName}">${opt.name}</span>
          <span class="${styles.resultsCount}">${pollType < 3 ? `${opt.count} votos` : `${opt.count.toFixed(2)} pts`}</span>
        </li>`).join('');

      return `
        <div class="${styles.questionResultBlock}">
          <h3 class="${styles.questionResultTitle}">${questionData.texto_pregunta}</h3>
          <p class="${styles.winnerTextSmall}">
            🏆 Ganador: <strong class="${styles.winnerNameSmall}">${winner.name}</strong> 
            con ${pollType < 3 ? `${winner.count} votos` : `${winner.count.toFixed(2)} pts`}
          </p>
          <ol class="${styles.resultsOl}">${resultsHtml}</ol>
        </div>
      `;
    }).join(`<hr class="${styles.questionSeparator}" />`);

    Swal.fire({
      title: `<span class="${styles.winnerTitle}"><Crown size={28} /> ¡Resultados Finales! <Crown size={28} /></span>`,
      html: `<p class="${styles.pollTitleModal}">Encuesta: "${poll.titulo}"</p>${resultsByQuestionHtml}`,
      confirmButtonText: 'Compartir Resultados como Imagen',
      showCloseButton: true,
      width: '600px',
    }).then((result) => { 
      if (result.isConfirmed) { 
        handleShareResults(processedData); 
      } 
    });
  };

  const handleShareResults = async (processedData: ResultQuestionData[]) => {
    const original = shareableResultRef.current!;
    if (!original || !poll) {
      Swal.fire('Error', 'No se encontró el elemento para la imagen.', 'error');
      return;
    }

    const clone = original.cloneNode(true) as HTMLElement;
    clone.classList.add(styles.shareableResultsVisible);

    const { width, height } = original.getBoundingClientRect();
    Object.assign(clone.style, {
      position: 'absolute', top: '-9999px', left: '0px', display: 'block', visibility: 'visible',
      opacity: '1', width: `${width}px`, height: `${height}px`, background: '#ffffff',
    });

    document.body.appendChild(clone);

    try {
      const imgs = Array.from(clone.querySelectorAll('img'));
      await Promise.all(imgs.map(async img => {
        if (img.src && !img.src.startsWith('data:')) {
          try {
            const res  = await fetch(img.src);
            const blob = await res.blob();
            img.src = await new Promise<string>(resolve => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          } catch (e) { console.error("Error fetching image for canvas: ", e); }
        }
      }));

      await new Promise(r => setTimeout(r, 100));
      const canvas = await html2canvas(clone, {
        useCORS: true, backgroundColor: '#ffffff', scale: 2.5, width, height,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'resultados-encuesta.png', { type: 'image/png' });
      
      // Texto genérico porque puede haber múltiples ganadores
      const shareData = {
        title: `Resultados de: ${poll.titulo}`,
        text:  `🏆 ¡Consulta los resultados de la encuesta!`,
        files: [file],
      };
      Swal.close();

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share(shareData);
      } else {
        const link = document.createElement('a');
        link.download = 'resultados-encuesta.png';
        link.href = dataUrl;
        link.click();
        Swal.fire('Descargado', 'Imagen de resultados guardada.', 'success');
      }
    } catch (err) {
      console.error('Error generando imagen:', err);
      Swal.fire('Error', 'No se pudo crear la imagen.', 'error');
    } finally {
      document.body.removeChild(clone);
    }
  }


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

      const results = new Map<number, ResultQuestionData>();
      const optionMap = new Map(opts.map(o => [o.id_opcion, o.texto_opcion]));

      qs.forEach(q => {
        const questionOptions = opts
          .filter(o => o.id_pregunta === q.id_pregunta)
          .map(o => ({ name: o.texto_opcion, count: 0, url_imagen: o.url_imagen, voteCount: 0, sumOfValues: 0 }));

        const questionVotes = votes.filter(v => v.id_pregunta === q.id_pregunta);
        
        questionVotes.forEach(v => {
          const optionName = optionMap.get(v.id_opcion_seleccionada!);
          const option = questionOptions.find(o => o.name === optionName);

          if (option) {
            if (id_tipo_votacion === 1 || id_tipo_votacion === 2) {
              option.count++;
            } else if (id_tipo_votacion === 3) {
              option.sumOfValues! += v.valor_puntuacion!;
              option.voteCount!++;
            } else if (id_tipo_votacion === 4) {
              option.sumOfValues! += v.orden_ranking!;
              option.voteCount!++;
            }
          }
        });
        
        if (id_tipo_votacion === 3 || id_tipo_votacion === 4) {
          questionOptions.forEach(opt => {
            opt.count = opt.voteCount! > 0 ? parseFloat((opt.sumOfValues! / opt.voteCount!).toFixed(2)) : 0;
          });
        }
        
        results.set(q.id_pregunta, {
          id_pregunta: q.id_pregunta, texto_pregunta: q.texto_pregunta, options: questionOptions
        });
      });

      results.forEach(questionData => {
        if (id_tipo_votacion === 4) {
          questionData.options.sort((a, b) => a.count - b.count);
        } else {
          questionData.options.sort((a, b) => b.count - a.count);
        }
      });
      
      const finalResults = Array.from(results.values());
      setData(finalResults);
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
      {/* --- DIV OCULTO ACTUALIZADO --- */}
      {data.length > 0 && poll && (
        <div ref={shareableResultRef} className={styles.shareableResultsContainer}>
            <div className={styles.shareableHeader}>
              <Crown size={28} />
              <h2>Resultados Finales</h2>
              <Crown size={28} />
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