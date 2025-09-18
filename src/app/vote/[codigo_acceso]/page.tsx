'use client'

import React, { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { supabase } from '../../../lib/supabaseClient'
import Swal from 'sweetalert2'
import styles from './page.module.css'
import Image from 'next/image'
import { User, Clock } from 'lucide-react'

// Interfaces
interface Poll {
    id_encuesta: number
    titulo: string
    descripcion: string | null
    estado: string
    tipo_votacion?: { nombre: string }
    duracion_segundos: number | null
    fecha_activacion: string | null
}
interface Pregunta {
  id_pregunta:    number
  texto_pregunta: string
  url_imagen:     string | null
  opciones:       { id_opcion: number; texto_opcion: string; url_imagen: string | null }[]
}
interface JudgeInfo {
    id_juez: number;
    nombre_completo: string;
}

export default function VotePage() {
  const { codigo_acceso } = useParams<{ codigo_acceso: string }>()

  const [poll, setPoll] = useState<Poll | null>(null)
  const [preguntas, setPreguntas] = useState<Pregunta[]>([])
  const [judgeInfo, setJudgeInfo] = useState<JudgeInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const [singleResp, setSingleResp] = useState<Record<number, number>>({})
  const [projectScores, setProjectScores] = useState<Record<number, number>>({})

  const isProjectsPoll = poll?.tipo_votacion?.nombre === 'Proyectos';
  const isCandidatesPoll = poll?.tipo_votacion?.nombre === 'Candidatas';

  const handleSingleChange = (qId: number, oId: number) => setSingleResp(prev => ({ ...prev, [qId]: oId }));
  const handleProjectScoreChange = (pId: number, val: number) => {
    const score = Math.max(0, Math.min(10, val));
    if (isNaN(score)) return;
    setProjectScores(prev => ({ ...prev, [pId]: score }));
  };

  useEffect(() => {
    const initVoter = async () => {
        if (!codigo_acceso) return;
        const isJudge = codigo_acceso.startsWith('JUEZ-');
        if (isJudge) {
            await loadJudgeData();
        } else {
            const fp = await FingerprintJS.load();
            const result = await fp.get();
            setFingerprint(result.visitorId);
            await loadPublicData(result.visitorId);
        }
    };
    initVoter();
  }, [codigo_acceso]);

      useEffect(() => {
        if (!poll || !poll.duracion_segundos || !poll.fecha_activacion || poll.estado !== 'activa') {
            setTimeLeft(null);
            return;
        }

        const endTime = new Date(poll.fecha_activacion).getTime() + poll.duracion_segundos * 1000;

        const interval = setInterval(() => {
            const now = Date.now();
            const remaining = Math.round((endTime - now) / 1000);

            if (remaining <= 0) {
                setTimeLeft(0);
                clearInterval(interval);
                // Opcional: mostrar una alerta de que el tiempo se acabó
                Swal.fire({
                    icon: 'info',
                    title: '¡Tiempo terminado!',
                    text: 'El período de votación para esta encuesta ha finalizado.',
                    allowOutsideClick: false
                });
            } else {
                setTimeLeft(remaining);
            }
        }, 1000);

        return () => clearInterval(interval); // Limpieza al desmontar el componente
    }, [poll]);

  const loadJudgeData = async () => {
    setLoading(true);
    const { data: judgePollLink, error: judgeErr } = await supabase
        .from('encuesta_jueces')
        .select('id_encuesta, id_juez, jueces(nombre_completo)')
        .eq('codigo_acceso_juez', codigo_acceso)
        .single();

    if (judgeErr || !judgePollLink || !judgePollLink.jueces) {
        setError("Código de acceso de juez no válido o no encontrado.");
        setLoading(false);
        return;
    }
    
    const { id_encuesta, id_juez, jueces } = judgePollLink;
    let judgeName = '';
    if (jueces) {
        if (Array.isArray(jueces) && jueces.length > 0) {
            judgeName = jueces[0].nombre_completo;
        } else if (typeof jueces === 'object' && !Array.isArray(jueces) && 'nombre_completo' in jueces) {
            judgeName = (jueces as { nombre_completo: string }).nombre_completo;
        }
    }
    if (!judgeName) {
      setError("No se pudo obtener la información del juez.");
      setLoading(false);
      return;
    }
    setJudgeInfo({ id_juez, nombre_completo: judgeName });
    await loadPollData(id_encuesta, { judgeId: id_juez });
  };

  const loadPublicData = async (fp: string) => {
    setLoading(true);
    const { data: p, error: pe } = await supabase.from('encuestas').select('id_encuesta').eq('codigo_acceso', codigo_acceso).single();
    if (pe || !p) {
        setError('Enlace de encuesta inválido o no encontrado.'); setLoading(false); return;
    }
    await loadPollData(p.id_encuesta, { fingerprint: fp });
  };

  const loadPollData = async (pollId: number, voter: { fingerprint?: string, judgeId?: number }) => {
    const { data: p, error: pe } = await supabase
            .from('encuestas').select('*, duracion_segundos, fecha_activacion, tipo_votacion:id_tipo_votacion (nombre)')
            .eq('id_encuesta', pollId).single();
    
    if (pe || !p) { setError('No se pudo cargar la encuesta.'); setLoading(false); return; }
    if (p.estado !== 'activa') { setPoll(p); setError(`Esta encuesta no está disponible. Estado: ${p.estado.toUpperCase()}`); setLoading(false); return; }
    setPoll(p);

    let voteCheckQuery;
    if (voter.judgeId) {
        voteCheckQuery = supabase.from('votos_respuestas').select('id_voto', { count: 'exact' }).eq('id_encuesta', pollId).eq('id_juez', voter.judgeId);
    } else {
        voteCheckQuery = supabase.from('votos').select('id_voto', { count: 'exact' }).eq('id_encuesta', pollId).eq('huella_dispositivo', voter.fingerprint!);
    }
    const { count: voteCount } = await voteCheckQuery;
    if (voteCount && voteCount > 0) { setHasVoted(true); setLoading(false); return; }

    const { data: qs, error: qe } = await supabase.from('preguntas_encuesta').select('*, opciones_pregunta(*)').eq('id_encuesta', p.id_encuesta).order('id_pregunta');
    if (qe) { setError(qe.message); setLoading(false); return; }
    
    const loadedQuestions = qs.map(q => ({ ...q, opciones: q.opciones_pregunta || [] }));
    setPreguntas(loadedQuestions);

    if (p.tipo_votacion?.nombre === 'Proyectos') {
        const initialScores: Record<number, number> = {};
        loadedQuestions.forEach(q => { initialScores[q.id_pregunta] = 5.0; });
        setProjectScores(initialScores);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (timeLeft === 0) {
            Swal.fire({ icon: 'error', title: 'Tiempo Terminado', text: 'El tiempo para votar ha expirado.' });
            return;
        }
    if (!poll || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
        const { data: currentPoll } = await supabase.from('encuestas').select('estado').eq('id_encuesta', poll.id_encuesta).single();
        if (currentPoll?.estado !== 'activa') throw new Error("Esta encuesta ya no está activa.");

        const respuestas: Omit<any, 'id_voto'>[] = [];
        for (const q of preguntas) {
            if (isCandidatesPoll) {
                const sel = singleResp[q.id_pregunta];
                if (!sel) throw new Error(`Debes seleccionar una opción en "${q.texto_pregunta}"`);
                respuestas.push({ id_encuesta: poll.id_encuesta, id_pregunta: q.id_pregunta, id_opcion_seleccionada: sel, id_juez: judgeInfo?.id_juez ?? null });
            } else if (isProjectsPoll) {
                const score = projectScores[q.id_pregunta];
                if (score === undefined) throw new Error(`Debes calificar el proyecto "${q.texto_pregunta}"`);
                respuestas.push({ id_encuesta: poll.id_encuesta, id_pregunta: q.id_pregunta, valor_puntuacion: score, id_juez: judgeInfo?.id_juez ?? null });
            }
        }

        if (respuestas.length === 0) throw new Error("No has respondido ninguna pregunta.");
        
        if (!judgeInfo && fingerprint) {
            const { error: voteErr } = await supabase.from('votos').insert({ id_encuesta: poll.id_encuesta, huella_dispositivo: fingerprint });
            if (voteErr?.code === '23505') throw new Error('Ya has votado en esta encuesta.');
            else if (voteErr) throw voteErr;
        }

        await supabase.from('votos_respuestas').insert(respuestas).throwOnError();
        
        setHasVoted(true);
        await Swal.fire({ icon: 'success', title: '¡Voto Exitoso!', text: 'Gracias por participar.' });
    } catch (err: any) {
        setError(err.message);
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

  if (loading) return <p className={styles.info}>Cargando Encuesta…</p>;
  if (hasVoted) return (
    <div className={styles.container}>
      <h1 className={styles.title}>{poll?.titulo}</h1>
      <p className={styles.info1}>Ya has votado en esta encuesta. ¡Gracias!</p>
    </div>
  );
  if (error) return (
    <div className={styles.container}>
      {poll && <h1 className={styles.title}>{poll.titulo}</h1>}
      <p className={styles.error}>{error}</p>
    </div>
  );
  if (!poll) return null;

  return (
    <form onSubmit={handleSubmit} className={styles.container}>
      {judgeInfo && (
          <div className={styles.judgeWelcome}>
              <User /> Votando como Juez: <strong>{judgeInfo.nombre_completo}</strong>
          </div>
      )}
      {timeLeft !== null && (
                <div className={styles.timer}>
                    <Clock size={20} />
                    <span>Tiempo restante: <strong>{formatTime(timeLeft)}</strong></span>
                </div>
            )}
      <h1 className={styles.title}>{poll.titulo}</h1>
      {poll.descripcion && <p className={styles.description}>{poll.descripcion}</p>}
      
      {preguntas.map(q => (
        <fieldset key={q.id_pregunta} className={styles.questionBlock}>
          <legend>{q.texto_pregunta}</legend>
          {q.url_imagen && (<Image src={q.url_imagen} alt={q.texto_pregunta} width={200} height={150} className={styles.questionImg}/>)}

          {isCandidatesPoll && (
            <div className={styles.optionList}>
              {q.opciones.map(o => (
                <label key={o.id_opcion} className={styles.optionItem}>
                  <input type="radio" name={`q_${q.id_pregunta}`} checked={singleResp[q.id_pregunta] === o.id_opcion} onChange={() => handleSingleChange(q.id_pregunta, o.id_opcion)} className={styles.radioInput} />
                  <div className={styles.optionLabel}>
                    {o.url_imagen && <Image src={o.url_imagen} alt={o.texto_opcion} width={48} height={48} className={styles.optionImg} />}
                    <span>{o.texto_opcion}</span>
                  </div>
                </label>
              ))}
            </div>
          )}
          
          {isProjectsPoll && (
            <div className={styles.scoringGrid}>
                <div key={q.id_pregunta} className={styles.scoringItem}>
                    <div className={styles.sliderGroup}>
                        <span className={styles.sliderLimit}>0</span>
                        <input type="range" id={`score_range_${q.id_pregunta}`} min={0} max={10} step={0.1} value={projectScores[q.id_pregunta] ?? 5} onChange={e => handleProjectScoreChange(q.id_pregunta, parseFloat(e.target.value))} className={styles.sliderInput} />
                        <span className={styles.sliderLimit}>10</span>
                    </div>
                    <div className={styles.scoreInputGroup}>
                        <label htmlFor={`score_input_${q.id_pregunta}`}>Puntuación Exacta:</label>
                        <input type="number" id={`score_input_${q.id_pregunta}`} min={0} max={10} step={0.1} value={projectScores[q.id_pregunta] ?? ''} onChange={e => handleProjectScoreChange(q.id_pregunta, parseFloat(e.target.value))} className={styles.inputScore} />
                    </div>
                    <span className={styles.sliderValue}>Puntuación Final: <strong>{projectScores[q.id_pregunta]?.toFixed(1) ?? '5.0'}</strong></span>
                </div>
            </div>
          )}
        </fieldset>
      ))}
      
      {error && <p className={styles.error}>{error}</p>}
      <button type="submit" className={styles.submitBtn} disabled={isSubmitting || timeLeft === 0}>
                {timeLeft === 0 ? 'Tiempo Terminado' : (isSubmitting ? 'Enviando Voto...' : 'Enviar Voto')}
            </button>
    </form>
  )
}