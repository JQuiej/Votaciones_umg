'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import Swal from 'sweetalert2'
import styles from './page.module.css'
import Image from 'next/image'
import { User, Clock } from 'lucide-react'

// --- Interfaces ---
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
interface StudentInfo {
    id_alumno: number;
    nombre_completo: string;
}
type PublicUser = StudentInfo | JudgeInfo;

export default function VotePage() {
  const { codigo_acceso } = useParams<{ codigo_acceso: string }>()
  const router = useRouter()

  const [poll, setPoll] = useState<Poll | null>(null)
  const [preguntas, setPreguntas] = useState<Pregunta[]>([])
  const [judgeInfo, setJudgeInfo] = useState<JudgeInfo | null>(null)
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
        const isJudgeAccessCode = codigo_acceso.startsWith('JUEZ-');
        
        if (isJudgeAccessCode) {
            await loadJudgeData();
        } else {
            try {
                const storedUser = sessionStorage.getItem('votingUser');
                if (storedUser) {
                    const user: PublicUser = JSON.parse(storedUser);
                    if('carne' in user) { // Es un estudiante
                      setStudentInfo(user as StudentInfo);
                    } else { // Es un juez votando como público
                      setJudgeInfo(user as JudgeInfo);
                    }
                    await loadPublicData(user);
                } else {
                    router.push('/vote');
                    return;
                }
            } catch (e) {
                setError("Error al verificar la sesión del votante.");
                setLoading(false);
            }
        }
    };
    initVoter();
  }, [codigo_acceso, router]);

  useEffect(() => {
    if (!poll || poll.estado !== 'activa' || !poll.duracion_segundos || !poll.fecha_activacion) {
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
            setError('El tiempo para votar ha finalizado.');
        } else {
            setTimeLeft(remaining);
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [poll]);

  const loadJudgeData = async () => {
    setLoading(true);
    const { data: judgePollLink, error: judgeErr } = await supabase
        .from('encuesta_jueces')
        .select('id_encuesta, id_juez, jueces(nombre_completo)')
        .eq('codigo_acceso_juez', codigo_acceso)
        .single();

    if (judgeErr || !judgePollLink || !judgePollLink.jueces) {
        setError("Código de acceso de juez no válido."); setLoading(false); return;
    }
    
    const { id_encuesta, id_juez } = judgePollLink;
    const juez = judgePollLink.jueces as unknown as { nombre_completo: string };
    
    setJudgeInfo({ id_juez, nombre_completo: juez.nombre_completo });
    await loadPollData(id_encuesta, { judgeId: id_juez });
  };

  const loadPublicData = async (user: PublicUser) => {
    setLoading(true);
    const { data: p, error: pe } = await supabase.from('encuestas').select('id_encuesta').eq('codigo_acceso', codigo_acceso).single();
    if (pe || !p) { setError('Enlace de encuesta inválido.'); setLoading(false); return; }

    if ('id_juez' in user) {
        const { count } = await supabase
            .from('encuesta_jueces')
            .select('id_juez', { count: 'exact', head: true })
            .eq('id_encuesta', p.id_encuesta)
            .eq('id_juez', user.id_juez);
        if (count && count > 0) {
            setError("Eres juez en esta encuesta. Por favor, usa la sección 'Encuestas Asignadas' para votar.");
            setLoading(false);
            return;
        }
    }
    await loadPollData(p.id_encuesta, { publicUser: user });
  };

  const loadPollData = async (pollId: number, voter: { publicUser?: PublicUser, judgeId?: number }) => {
    const { data: p, error: pe } = await supabase.from('encuestas').select('*, duracion_segundos, fecha_activacion, tipo_votacion:id_tipo_votacion (nombre)').eq('id_encuesta', pollId).single();
    if (pe || !p) { setError('No se pudo cargar la encuesta.'); setLoading(false); return; }
    if (p.estado !== 'activa') { setPoll(p); setError(`Esta encuesta no está disponible (Estado: ${p.estado.toUpperCase()})`); setLoading(false); return; }
    setPoll(p);

    let voteCheckQuery;
    if (voter.judgeId) {
        voteCheckQuery = supabase.from('votos_respuestas').select('id_voto', { count: 'exact', head: true }).eq('id_encuesta', pollId).eq('id_juez', voter.judgeId);
    } else if (voter.publicUser) {
        const user = voter.publicUser;
        const userColumn = 'id_alumno' in user ? 'id_alumno' : 'id_juez';
        const userId = 'id_alumno' in user ? user.id_alumno : user.id_juez;
        voteCheckQuery = supabase.from('votos_respuestas').select('id_voto', { count: 'exact', head: true }).eq('id_encuesta', pollId).eq(userColumn, userId);
    }

    if (voteCheckQuery) {
        const { count } = await voteCheckQuery;
        if (count && count > 0) { setHasVoted(true); setLoading(false); return; }
    }

    const { data: qs, error: qe } = await supabase.from('preguntas_encuesta').select('*, opciones_pregunta(*)').eq('id_encuesta', p.id_encuesta).order('id_pregunta');
    if (qe) { setError(qe.message); setLoading(false); return; }
    
    setPreguntas(qs.map(q => ({ ...q, opciones: q.opciones_pregunta || [] })));
    if (p.tipo_votacion?.nombre === 'Proyectos') {
        setProjectScores(qs.reduce((acc, q) => ({ ...acc, [q.id_pregunta]: 5.0 }), {}));
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (timeLeft === 0 || !poll || isSubmitting) return;
    setIsSubmitting(true);

    try {
        const { data: currentPoll } = await supabase.from('encuestas').select('estado').eq('id_encuesta', poll.id_encuesta).single();
        if (currentPoll?.estado !== 'activa') throw new Error("Esta encuesta ya no está activa.");

        const respuestas = preguntas.map(q => {
            const isOfficialJudgeVote = codigo_acceso.startsWith('JUEZ-');
            const respuesta: Partial<any> = {
                id_encuesta: poll.id_encuesta,
                id_pregunta: q.id_pregunta,
                id_juez: isOfficialJudgeVote ? judgeInfo?.id_juez : (judgeInfo ? judgeInfo.id_juez : null),
                id_alumno: studentInfo ? studentInfo.id_alumno : null,
            };

            if (isProjectsPoll) {
                const score = projectScores[q.id_pregunta];
                if (score === undefined) throw new Error(`Debes calificar "${q.texto_pregunta}"`);
                respuesta.valor_puntuacion = score;
            } else { 
                const sel = singleResp[q.id_pregunta];
                if (!sel) throw new Error(`Debes seleccionar una opción en "${q.texto_pregunta}"`);
                respuesta.id_opcion_seleccionada = sel;
            }
            return respuesta;
        });

        if (respuestas.length === 0) throw new Error("No has respondido ninguna pregunta.");
        
        const { error: insertError } = await supabase.from('votos_respuestas').insert(respuestas);
        if (insertError) {
          if (insertError.code === '23505') throw new Error('Ya has emitido un voto en esta encuesta.');
          throw insertError;
        }
        
        setHasVoted(true);
        await Swal.fire({ icon: 'success', title: '¡Voto Registrado!', text: 'Gracias por tu participación.' });
    
    } catch (err: any) {
        Swal.fire({ icon: 'error', title: 'Error al Votar', text: err.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) return <p className={styles.info}>Cargando Encuesta…</p>;
  if (hasVoted) return (
    <div className={styles.pageWrapper}>
        <div className={styles.container}>
            <h1 className={styles.title}>{poll?.titulo}</h1>
            <p className={styles.info1}>Ya has votado en esta encuesta. ¡Gracias por participar!</p>
        </div>
    </div>
  );
  if (error) return (
    <div className={styles.pageWrapper}>
        <div className={styles.container}>
            {poll && <h1 className={styles.title}>{poll.titulo}</h1>}
            <p className={styles.error}>{error}</p>
        </div>
    </div>
  );
  if (!poll) return null;

  return (
    <div className={styles.pageWrapper}>
        <form onSubmit={handleSubmit} className={styles.container}>
            {codigo_acceso.startsWith('JUEZ-') ? (
                <div className={styles.judgeWelcome}>
                    <User /> Votando como Juez: <strong>{judgeInfo?.nombre_completo}</strong>
                </div>
            ) : (
                <div className={styles.judgeWelcome}>
                    <User /> Votando como: <strong>Público</strong>
                </div>
            )}

            {timeLeft !== null && isProjectsPoll && (
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
                    {isProjectsPoll ? (
                        <div className={styles.scoringGrid}>
                            <div className={styles.scoringItem}>
                                <div className={styles.sliderGroup}>
                                    <span className={styles.sliderLimit}>0</span>
                                    <input type="range" min={0} max={10} step={0.1} value={projectScores[q.id_pregunta] ?? 5} onChange={e => handleProjectScoreChange(q.id_pregunta, parseFloat(e.target.value))} className={styles.sliderInput} />
                                    <span className={styles.sliderLimit}>10</span>
                                </div>
                                <div className={styles.scoreInputGroup}>
                                    <label>Puntuación Exacta:</label>
                                    <input type="number" min={0} max={10} step={0.1} value={projectScores[q.id_pregunta] ?? ''} onChange={e => handleProjectScoreChange(q.id_pregunta, parseFloat(e.target.value))} className={styles.inputScore} />
                                </div>
                                <span className={styles.sliderValue}>Puntuación Final: <strong>{projectScores[q.id_pregunta]?.toFixed(1) ?? '5.0'}</strong></span>
                            </div>
                        </div>
                    ) : (
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
                </fieldset>
            ))}
            
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting || timeLeft === 0}>
                {timeLeft === 0 ? 'Tiempo Terminado' : (isSubmitting ? 'Enviando Voto...' : 'Enviar Voto')}
            </button>
        </form>
    </div>
  )
}