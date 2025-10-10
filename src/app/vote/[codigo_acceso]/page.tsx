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
    id_encuesta: number;
    titulo: string;
    descripcion: string | null;
    estado: string;
    id_tipo_votacion: number;
    tipo_votacion?: { nombre: string };
    duracion_segundos: number | null;
    fecha_activacion: string | null;
}
interface Pregunta {
  id_pregunta:    number
  texto_pregunta: string
  url_imagen:     string | null
  opciones:       { id_opcion: number; texto_opcion: string; url_imagen: string | null }[]
}

// --- INTERFAZ CORREGIDA ---
interface Judge { id_juez: number; nombre_completo: string; codigo_unico: string; }
interface PublicUser { visitorId: string; nombre_completo: string; }
type VotingUser = Judge | PublicUser;

export default function VoteExecutionPage() {
  const { codigo_acceso } = useParams<{ codigo_acceso: string }>()
  const router = useRouter()

  const [poll, setPoll] = useState<Poll | null>(null)
  const [preguntas, setPreguntas] = useState<Pregunta[]>([])
  const [votingUser, setVotingUser] = useState<VotingUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const [singleResp, setSingleResp] = useState<Record<number, number>>({})
  const [projectScores, setProjectScores] = useState<Record<number, number>>({})

  const isProjectsPoll = poll?.tipo_votacion?.nombre === 'Proyectos';

  const handleSingleChange = (qId: number, oId: number) => setSingleResp(prev => ({ ...prev, [qId]: oId }));
  const handleProjectScoreChange = (pId: number, val: number) => {
    const score = Math.max(0, Math.min(10, val));
    if (isNaN(score)) return;
    setProjectScores(prev => ({ ...prev, [pId]: score }));
  };

  useEffect(() => {
    const loadDataForVoter = async () => {
        if (!codigo_acceso) return;

        const storedUserStr = sessionStorage.getItem('votingUser');
        if (!storedUserStr) {
            router.replace(`/vote?code=${codigo_acceso}`);
            return;
        }

        const user: VotingUser = JSON.parse(storedUserStr);
        setVotingUser(user);
        
        const isJudgeAccessCode = codigo_acceso.startsWith('JUEZ-');
        
        let pollId: number | null = null;
        let voterIdentifier: { judgeId?: number; visitorId?: string } = {};

        if (isJudgeAccessCode) {
            const { data: judgeLink } = await supabase.from('encuesta_jueces').select('id_encuesta, id_juez').eq('codigo_acceso_juez', codigo_acceso).single();
            if (!judgeLink || !('id_juez' in user) || judgeLink.id_juez !== user.id_juez) {
                setError("Acceso de juez inválido."); setLoading(false); return;
            }
            pollId = judgeLink.id_encuesta;
            voterIdentifier = { judgeId: user.id_juez };
        } else {
            const { data: publicPoll } = await supabase.from('encuestas').select('id_encuesta, id_tipo_votacion').eq('codigo_acceso', codigo_acceso).single();
            if (!publicPoll) {
                setError("Enlace de votación inválido."); setLoading(false); return;
            }
            pollId = publicPoll.id_encuesta;
            
            if ('id_juez' in user) {
                const { count } = await supabase.from('encuesta_jueces').select('*', { count: 'exact', head: true }).eq('id_encuesta', pollId).eq('id_juez', user.id_juez);
                if (count && count > 0) {
                     Swal.fire('Acción no permitida', 'Eres juez en esta encuesta. Por favor, usa la sección "Encuestas Asignadas" en el portal para votar.', 'warning');
                     router.replace('/vote');
                     return;
                }
            }
            
            voterIdentifier = 'visitorId' in user ? { visitorId: user.visitorId } : { judgeId: user.id_juez };
        }

        if (pollId) {
            await loadPollData(pollId, voterIdentifier);
        }
    };
    loadDataForVoter();
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

  const loadPollData = async (pollId: number, voter: { visitorId?: string, judgeId?: number }) => {
    const { data: p, error: pe } = await supabase.from('encuestas').select('*, duracion_segundos, fecha_activacion, tipo_votacion:id_tipo_votacion (nombre)').eq('id_encuesta', pollId).single();
    if (pe || !p) { setError('No se pudo cargar la encuesta.'); setLoading(false); return; }
    if (p.estado !== 'activa') { setPoll(p); setError(`Esta encuesta no está disponible (Estado: ${p.estado.toUpperCase()})`); setLoading(false); return; }
    setPoll(p);

    let voteCheckQuery;
    if (voter.judgeId) {
        voteCheckQuery = supabase.from('votos').select('id_voto', { count: 'exact', head: true }).eq('id_encuesta', pollId).eq('id_juez', voter.judgeId);
    } else if (voter.visitorId) {
        voteCheckQuery = supabase.from('votos').select('id_voto', { count: 'exact', head: true }).eq('id_encuesta', pollId).eq('huella_dispositivo', voter.visitorId);
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
    if (timeLeft === 0 || !poll || isSubmitting || !votingUser) return;
    setIsSubmitting(true);
    
    const result = await Swal.fire({
        title: '¿Confirmas tu voto?', text: "Una vez enviado, no podrás modificar tu elección.", icon: 'question',
        showCancelButton: true, confirmButtonColor: '#10b981', cancelButtonColor: '#ef4444',
        confirmButtonText: 'Sí, emitir voto', cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) { setIsSubmitting(false); return; }
    
    try {
        const { data: currentPoll } = await supabase.from('encuestas').select('estado').eq('id_encuesta', poll.id_encuesta).single();
        if (currentPoll?.estado !== 'activa') throw new Error("Esta encuesta ya no está activa.");
        
        // --- INICIO DE LA CORRECCIÓN ---
        const votePayload: any = {
            id_encuesta: poll.id_encuesta,
            id_juez: 'id_juez' in votingUser ? votingUser.id_juez : null,
            // Si es un juez, usa su código único; si es público, usa la huella.
            huella_dispositivo: 'visitorId' in votingUser 
                ? votingUser.visitorId 
                : votingUser.codigo_unico,
        };
        // --- FIN DE LA CORRECCIÓN ---

        const { data: vote, error: voteError } = await supabase.from('votos').insert(votePayload).select().single();

        if (voteError) {
          if (voteError.code === '23505') throw new Error('Ya has emitido un voto en esta encuesta.');
          throw voteError;
        }
        
        const respuestas = preguntas.map(q => {
            const respuesta: Partial<any> = {
                id_voto: vote.id_voto,
                id_encuesta: poll.id_encuesta,
                id_pregunta: q.id_pregunta,
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
        if (insertError) throw insertError;
        
        setHasVoted(true);
        await Swal.fire({ icon: 'success', title: '¡Voto Registrado!', text: 'Gracias por tu participación.' });
        router.push('/vote');
    
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
            <button onClick={() => router.push('/vote')} className={styles.backButton}>Volver al Portal</button>
        </div>
    </div>
  );
  if (error) return (
    <div className={styles.pageWrapper}>
        <div className={styles.container}>
            {poll && <h1 className={styles.title}>{poll.titulo}</h1>}
            <p className={styles.error}>{error}</p>
            <button onClick={() => router.push('/vote')} className={styles.backButton}>Volver al Portal</button>
        </div>
    </div>
  );
  if (!poll || !votingUser) return null;

  return (
    <div className={styles.pageWrapper}>
        <form onSubmit={handleSubmit} className={styles.container}>
             <div className={styles.judgeWelcome}>
                <User /> Votando como: <strong>{votingUser.nombre_completo}</strong>
            </div>

            {timeLeft !== null && isProjectsPoll && (
                <div className={styles.timer}>
                    <Clock size={20} />
                    <span>Tiempo restante: <strong>{formatTime(timeLeft)}</strong></span>
                </div>
            )}
            
            <h1 className={styles.title}>{poll.titulo}</h1>
            {poll.descripcion && <p className={styles.description}>{poll.descripcion}</p>}
            
            {preguntas.map(q => (
                isProjectsPoll ? (
                    <div key={q.id_pregunta} className={styles.projectCard}>
                        <h2 className={styles.projectTitle}>{q.texto_pregunta}</h2>
                        {q.opciones && q.opciones.length > 0 && (
                            <p className={styles.studentName}>{q.opciones[0].texto_opcion}</p>
                        )}
                        {q.url_imagen && (<Image src={q.url_imagen} alt={q.texto_pregunta} width={200} height={150} className={styles.questionImg}/>)}
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
                    </div>
                ) : (
                    <fieldset key={q.id_pregunta} className={styles.questionBlock}>
                        <legend>{q.texto_pregunta}</legend>
                        {q.url_imagen && (<Image src={q.url_imagen} alt={q.texto_pregunta} width={200} height={150} className={styles.questionImg}/>)}
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
                    </fieldset>
                )
            ))}
            
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting || timeLeft === 0}>
                {timeLeft === 0 ? 'Tiempo Terminado' : (isSubmitting ? 'Enviando Voto...' : 'Enviar Voto')}
            </button>
        </form>
    </div>
  )
}