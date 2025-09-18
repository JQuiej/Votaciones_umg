// src/app/dashboard/realtime/[id]/page.tsx
'use client'

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import Swal from 'sweetalert2';
import html2canvas from 'html2canvas';
import { Share2, PartyPopper, Crown, User, Users, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../../../lib/supabaseClient';
import Confetti from 'react-confetti';
import dynamic from 'next/dynamic';
import styles from './page.module.css';

// --- Interfaces ---
interface PollDetails {
    id_encuesta: number;
    id_tipo_votacion: number;
    titulo: string;
    estado: string;
    url_votacion: string;
    codigo_acceso: string;
    duracion_segundos: number | null;
    created_at: string;
    fecha_activacion: string | null;
    tipo_votacion?: { nombre: string };
}
interface Judge {
    id_juez: number;
    nombre_completo: string;
    url_imagen: string | null;
}
interface ProjectResult {
    id: number;
    name: string;
    imageUrl: string | null;
    judgeScores: { name: string; score: number | null; imageUrl: string | null }[];
    publicScore: number;
    totalScore: number;
}
interface CandidateResult {
    id_pregunta: number;
    texto_pregunta: string;
    url_imagen: string | null;
    options: { name: string; count: number; url_imagen?: string | null }[];
}
type ResultData = ProjectResult | CandidateResult;

// Crea la versión dinámica del componente de gráficos
const DynamicChartDisplay = dynamic(
    () => import('./ChartDisplay'), 
    { 
        ssr: false, // La clave: deshabilita el renderizado en servidor
        loading: () => <div style={{height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Cargando gráficos...</div>
    }
);

export default function RealtimePollResultsPage() {
    const params = useParams();
    const router = useRouter();
    
    const [pollDetails, setPollDetails] = useState<PollDetails | null>(null);
    const [data, setData] = useState<ResultData[]>([]);
    const [view, setView] = useState<'bar' | 'pie'>('bar');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [totalVotes, setTotalVotes] = useState(0);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [judgeNames, setJudgeNames] = useState<string[]>([]);

    const shareableResultRef = useRef<HTMLDivElement>(null);

    const pollId = params.id ? parseInt(params.id as string, 10) : NaN;

    const isProjectsPoll = pollDetails?.tipo_votacion?.nombre === 'Proyectos';
    const isCandidatesPoll = pollDetails?.tipo_votacion?.nombre === 'Candidatas';
    const hasVotes = data.length > 0 && data.some(p => 
        (p as ProjectResult).totalScore > 0 || 
        (p as CandidateResult).options?.some(o => o.count > 0)
    );

    useEffect(() => {
        if (isNaN(pollId)) {
            setError("ID de encuesta no válido.");
            setLoading(false);
            return;
        }

        const loadData = async (isInitialLoad = false) => {
            if (isInitialLoad) setLoading(true);

            const { data: poll, error: pollErr } = await supabase.from('encuestas')
                .select('*, tipo_votacion:id_tipo_votacion(nombre)')
                .eq('id_encuesta', pollId).single();
                
            if (pollErr || !poll) { setError('Encuesta no encontrada.'); setLoading(false); return; }
            setPollDetails(poll);

            if (poll.tipo_votacion?.nombre === 'Proyectos') {
                await processProjectResults(poll);
            } else if (poll.tipo_votacion?.nombre === 'Candidatas') {
                await processCandidateResults(poll);
            } else {
                setError("Este tipo de encuesta no tiene vista de resultados en tiempo real.");
                setData([]);
            }

            if (isInitialLoad) setLoading(false);
        };

        const processProjectResults = async (poll: PollDetails) => {
            const { data: projects, error: pErr } = await supabase.from('preguntas_encuesta').select('id_pregunta, texto_pregunta, url_imagen').eq('id_encuesta', poll.id_encuesta);
            if (pErr) { setError(`Error al cargar proyectos: ${pErr.message}`); return; }

            const { data: judges, error: jErr } = await supabase.from('encuesta_jueces').select('jueces(id_juez, nombre_completo, url_imagen)').eq('id_encuesta', poll.id_encuesta);

            console.log('JUECES OBTENIDOS DE LA BD:', judges); // <--- AÑADE ESTA LÍNEA

            if (jErr) { setError(`Error al cargar jueces: ${jErr.message}`); return; }

            const { data: votes, error: vErr } = await supabase.from('votos_respuestas').select('id_pregunta, valor_puntuacion, id_juez').eq('id_encuesta', poll.id_encuesta);
            if (vErr) { setError(`Error al cargar votos: ${vErr.message}`); return; }
            
            const assignedJudges = judges?.map(j => j.jueces).flat().filter(Boolean) as Judge[] || [];
            
            const uniqueJudgeNames = Array.from(new Set(assignedJudges.map(j => j.nombre_completo)));
            setJudgeNames(uniqueJudgeNames);

            const results: ProjectResult[] = projects!.map(p => {
                const projectVotes = votes?.filter(v => v.id_pregunta === p.id_pregunta) || [];
                const judgeVotes = projectVotes.filter(v => v.id_juez !== null);
                const publicVotes = projectVotes.filter(v => v.id_juez === null);
                setTotalVotes(publicVotes.length);

                const judgeScores = assignedJudges.map(judge => {
                    const vote = judgeVotes.find(v => v.id_juez === judge.id_juez);
                    return { 
                        name: judge.nombre_completo, 
                        score: vote ? vote.valor_puntuacion : null,
                        imageUrl: judge.url_imagen 
                    };
                });
                
                const publicSum = publicVotes.reduce((acc, v) => acc + (v.valor_puntuacion || 0), 0);
                const publicAverage = publicVotes.length > 0 ? (publicSum / publicVotes.length) : 0;
                const publicScore = publicAverage || 0;
                const totalJudgeScore = judgeScores.reduce((acc, j) => acc + (j.score || 0), 0);
                const totalScore = (totalJudgeScore || 0) + (publicScore || 0);

                return { id: p.id_pregunta, name: p.texto_pregunta, imageUrl: p.url_imagen, judgeScores, publicScore, totalScore };
            });
            results.sort((a, b) => b.totalScore - a.totalScore);
            setData(results);
        };

        const processCandidateResults = async (poll: PollDetails) => {
            const { data: questions, error: qErr } = await supabase.from('preguntas_encuesta').select('id_pregunta, texto_pregunta, url_imagen').eq('id_encuesta', poll.id_encuesta);
            if (qErr) { setError(`Error al cargar preguntas: ${qErr.message}`); return; }

            const questionIds = questions!.map(q => q.id_pregunta);
            if (questionIds.length === 0) { setData([]); return; }

            const { data: options, error: oErr } = await supabase.from('opciones_pregunta').select('*').in('id_pregunta', questionIds);
            if (oErr) { setError(`Error al cargar opciones: ${oErr.message}`); return; }

            const { data: votes, error: vErr } = await supabase.from('votos_respuestas').select('id_pregunta, id_opcion_seleccionada').in('id_pregunta', questionIds);
            if (vErr) { setError(`Error al cargar votos: ${vErr.message}`); return; }
            
            setTotalVotes(votes?.length || 0);

            const results: CandidateResult[] = questions!.map(q => {
                const questionVotes = votes?.filter(v => v.id_pregunta === q.id_pregunta) || [];
                const questionOptions = options!.filter(o => o.id_pregunta === q.id_pregunta);
                const processedOptions = questionOptions.map(opt => {
                    const voteCount = questionVotes.filter(v => v.id_opcion_seleccionada === opt.id_opcion).length || 0;
                    return { name: opt.texto_opcion, count: voteCount, url_imagen: opt.url_imagen };
                });
                processedOptions.sort((a, b) => b.count - a.count);
                return { id_pregunta: q.id_pregunta, texto_pregunta: q.texto_pregunta, url_imagen: q.url_imagen, options: processedOptions };
            });
            setData(results);
        };
        
        loadData(true);

        const channel = supabase.channel(`realtime-poll-${pollId}`);
        channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votos_respuestas', filter: `id_encuesta=eq.${pollId}` },
            () => loadData(false)
        ).subscribe();
        
        return () => { supabase.removeChannel(channel); };
    }, [pollId]);

    useEffect(() => {
        if (!pollDetails || pollDetails.estado !== 'activa' || !pollDetails.duracion_segundos || !pollDetails.fecha_activacion) {
            setTimeLeft(null); 
            return;
        }
        const endTime = new Date(pollDetails.fecha_activacion).getTime() + pollDetails.duracion_segundos * 1000;
        const interval = setInterval(() => {
            const now = Date.now();
            const remaining = Math.round((endTime - now) / 1000);
            if (remaining <= 0) {
                setTimeLeft(0); 
                clearInterval(interval); 
                handleEndPoll(true);
            } else {
                setTimeLeft(remaining);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [pollDetails]);
    
    const showWinnerModal = () => {
        if (!pollDetails || !hasVotes) return;
    
        const resultsByQuestionHtml = data.map(qData => {
            const isProject = 'totalScore' in qData;
            const questionTitle = isProject ? (qData as ProjectResult).name : (qData as CandidateResult).texto_pregunta;
            const options = isProject 
                ? (data as ProjectResult[]).map(p => ({ name: p.name, count: p.totalScore, url_imagen: p.imageUrl })).sort((a, b) => b.count - a.count)
                : (qData as CandidateResult).options;
            
            if (options.length === 0) return '';
    
            const resultsHtml = options.map((opt, index) => `
                <li class="${styles.resultsLi}">
                    <span class="${styles.rankNumber}">${index + 1}.</span>
                    ${opt.url_imagen ? `<img src="${opt.url_imagen}" alt="${opt.name}" class="${styles.resultsImg}" />` : ''}
                    <span class="${styles.resultsName}">${opt.name}</span>
                    <span class="${styles.resultsCount}">${isProject ? `${(opt.count as number).toFixed(2)} pts` : `${opt.count} votos`}</span>
                </li>`).join('');
    
            return `
                <div class="${styles.questionResultBlock}">
                    ${isCandidatesPoll ? `<h3 class="${styles.questionResultTitle}">${questionTitle}</h3>` : ''}
                    <ol class="${styles.resultsOl}">${resultsHtml}</ol>
                </div>`;
        }).join(isProjectsPoll ? '' : `<hr class="${styles.questionSeparator}" />`);
    
        Swal.fire({
            title: `<span class="${styles.winnerTitle}"> ¡Resultados Finales! </span>`,
            html: `<p class="${styles.pollTitleModal}">Encuesta: "${pollDetails.titulo}"</p>${resultsByQuestionHtml}`,
            confirmButtonText: 'Compartir como Imagen',
            showCloseButton: true,
            width: '600px',
            customClass: {
                title: styles.winnerTitle,
            }
        }).then((result) => { if (result.isConfirmed) { handleShareResults(); } });
    };

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
                    title: `Resultados de: ${pollDetails!.titulo}`,
                    text:  `🏆 ¡Consulta los resultados de la encuesta!`,
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

    const handleShare = () => {
        if (!pollDetails) return;
        const canvas = document.getElementById('hidden-qr-canvas') as HTMLCanvasElement;
        if (!canvas) { Swal.fire('Error', 'No se pudo generar el código QR.', 'error'); return; }
        const qrImageUrl = canvas.toDataURL('image/png');
        Swal.fire({
            title: 'Comparte tu Encuesta',
            html: `<div class="${styles.shareModalContent}">
                    <p>Los participantes pueden escanear este código para votar.</p>
                    <div class="${styles.qrContainerModal}"><img src="${qrImageUrl}" alt="Código QR" style="width: 200px; height: 200px;" /></div>
                    <div class="${styles.shareInfo}">
                        <strong>Enlace:</strong><input type="text" value="${pollDetails.url_votacion}" readonly class="${styles.shareInput}" onclick="this.select()" />
                        <strong>Código:</strong><input type="text" value="${pollDetails.codigo_acceso}" readonly class="${styles.shareInput}" onclick="this.select()" />
                    </div>
                    </div>`,
            showCloseButton: true, showConfirmButton: false, width: '400px',
        });
    };

    const handleEndPoll = async (isAuto = false) => {
        if (!pollDetails || pollDetails.estado !== 'activa') return;
        const endPollLogic = async () => {
            const { error } = await supabase.from('encuestas').update({ estado: 'finalizada' }).eq('id_encuesta', pollDetails.id_encuesta);
            if (error) { Swal.fire('Error', `No se pudo finalizar la encuesta: ${error.message}`, 'error'); } 
            else {
                setPollDetails(p => p ? { ...p, estado: 'finalizada' } : null);
                setShowConfetti(true);
                setTimeout(() => setShowConfetti(false), 8000);
                if(isAuto) Swal.fire('¡Tiempo Terminado!', 'La votación ha finalizado automáticamente.', 'info').then(() => showWinnerModal());
                else showWinnerModal();
            }
        };
        if(isAuto) {
            await endPollLogic();
        } else {
            const result = await Swal.fire({ title: '¿Finalizar la encuesta?', text: "Ya no se aceptarán más votos.", icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, finalizar' });
            if (result.isConfirmed) await endPollLogic();
        }
    };
    
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // --- FUNCIÓN NUEVA: SEMÁFORO DE PUNTUACIÓN ---
    const getScoreColor = (score: number, maxScore: number) => {
        if (maxScore === 0) return styles.scoreRed; // Evita división por cero
        const percentage = (score / maxScore) * 100;
        if (percentage < 35) return styles.scoreRed;
        if (percentage < 70) return styles.scoreOrange;
        return styles.scoreGreen;
    };
    
    if (loading) return <p className={styles.info}>Cargando resultados...</p>;
    if (error) return <p className={styles.error}>{error}</p>;
    if (!pollDetails) return <p className={styles.info}>No se encontraron detalles de la encuesta.</p>;

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28FDF'];

    // Calcula el puntaje máximo posible para cada proyecto
    // Cada juez puede dar hasta 10 puntos, el público también (promedio máximo 10)
    const maxPossibleScore = judgeNames.length * 10 + 10;

    return (
        <div className={styles.container}>
            {showConfetti && <Confetti width={typeof window !== 'undefined' ? window.innerWidth : 0} height={typeof window !== 'undefined' ? window.innerHeight : 0} className={styles.confettiCanvas} />}
            <div className={styles.header}>
                <button onClick={() => router.back()} className={styles.backButton}>←</button>
                <h1 className={styles.mainTitle}>{pollDetails.titulo}</h1>
                <div className={styles.headerActions}>
                    <button onClick={handleShare} className={styles.shareButton} title="Compartir Encuesta"><Share2 size={20} /> Compartir</button>
                    {timeLeft !== null && (<div className={styles.timer}>Tiempo restante: <strong>{formatTime(timeLeft)}</strong></div>)}
                    <button onClick={() => handleEndPoll(false)} className={styles.endButton} disabled={pollDetails.estado !== 'activa'}><PartyPopper size={20} /> Finalizar</button>
                    {pollDetails.estado === 'finalizada' && hasVotes && (
                        <button onClick={showWinnerModal} className={styles.shareButton}><ImageIcon size={20} /> Ver Resultados</button>
                    )}
                </div>
            </div>
            
            <div className={styles.totalVotesPanel}>{isProjectsPoll ? 'Votos del Público' : 'Votos Totales'}: <span>{totalVotes}</span></div>
            <h2 className={styles.subTitle}>Resultados en tiempo real</h2>
            
            {!hasVotes && <p className={styles.info}>Esperando los primeros votos...</p>}

            {isProjectsPoll && hasVotes && (
                <div className={styles.projectsContainer}>
                    <div className={styles.projectsGrid}>
                        {(data as ProjectResult[]).map((p, index) => (
                            <div key={p.id} className={styles.projectCard}>
                                <div className={styles.projectRank}>{index === 0 ? <Crown size={32} /> : `#${index + 1}`}</div>
                                {p.imageUrl && <Image src={p.imageUrl} alt={p.name} width={150} height={110} className={styles.projectImg} />}
                                <h3 className={styles.projectName}>{p.name}</h3>
                                <div className={`${styles.totalScore} ${getScoreColor(p.totalScore, maxPossibleScore)}`}>
                                    {p.totalScore.toFixed(2)} pts
                                </div>
                                <div className={styles.scoreBreakdown}>
                                    <div className={styles.scoreItem}><span><Users size={16} /> Público (Prom.):</span><strong>{p.publicScore.toFixed(2)} / 10.00</strong></div>
                                    {p.judgeScores.map((j, jIndex) => (
                                        <div key={jIndex} className={styles.scoreItem}>
                                            <span>
                                                {j.imageUrl ? (
                                                    <Image src={j.imageUrl} alt={j.name} width={24} height={24} className={styles.judgeAvatar} />
                                                ) : (
                                                    <User size={16} />
                                                )}
                                                {j.name}:
                                            </span>
                                            {j.score !== null ? <strong>{j.score.toFixed(2)} / 10.00</strong> : <em>Pendiente</em>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    {/* --- INICIO DE LA CORRECCIÓN --- */}
                    <DynamicChartDisplay
                        isProjectsPoll={true}
                        isCandidatesPoll={false}
                        data={data}
                        view={view}
                        COLORS={COLORS}
                        judgeNames={judgeNames} 
                        setView={() => {}}// <-- Añadido para cumplir con la interfaz
                    />
                    {/* --- FIN DE LA CORRECCIÓN --- */}
                </div>
            )}
            
            {isCandidatesPoll && hasVotes && (
                 <div className={styles.candidatesContainer}>
                    <div className={styles.toggleGroup}>
                        <button className={view === 'bar' ? styles.toggleActive : styles.toggleButton} onClick={() => setView('bar')}>Barras</button>
                        <button className={view === 'pie' ? styles.toggleActive : styles.toggleButton} onClick={() => setView('pie')}>Pastel</button>
                    </div>
                    {/* Los gráficos de candidatas ahora están dentro de DynamicChartDisplay */}
                    <DynamicChartDisplay 
                        isProjectsPoll={false}
                        isCandidatesPoll={isCandidatesPoll}
                        data={data}
                        view={view}
                        COLORS={COLORS}
                        setView={setView}
                        judgeNames={[]} // <-- AÑADE ESTA LÍNEA

                    />
                </div>
            )}
            
            {pollDetails && (<div style={{ display: 'none' }}><QRCodeCanvas id="hidden-qr-canvas" value={pollDetails.url_votacion} size={200} /></div>)}
            
            <div style={{ position: 'fixed', left: '-9999px', top: 0, background: 'white', padding: '1rem', zIndex: -1 }}>
                <div ref={shareableResultRef} className={styles.shareableResultsContainer}>
                    <div className={styles.shareableHeader}><Crown size={28} /><h2>Resultados Finales</h2><Crown size={28} /></div>
                    <p className={styles.shareablePollTitle}>Encuesta: &quot;{pollDetails.titulo}&quot;</p>
                    {data.map(qData => {
                        const isProject = 'totalScore' in qData;
                        const questionTitle = isProject ? (qData as ProjectResult).name : (qData as CandidateResult).texto_pregunta;
                        const options = isProject 
                            ? (data as ProjectResult[]).map(p => ({name: p.name, count: p.totalScore, url_imagen: p.imageUrl})).sort((a,b) => b.count - a.count)
                            : (qData as CandidateResult).options;
                        
                        return (
                            <div key={isProject ? (qData as ProjectResult).id : (qData as CandidateResult).id_pregunta} className={styles.shareableQuestionBlock}>
                                {data.length > 1 || !isProject ? <h3 className={styles.shareableQuestionTitle}>{questionTitle}</h3> : null}
                                <ol className={styles.shareableList}>
                                    {options.map((opt, index) => (
                                        <li key={index}>
                                            <span className={styles.shareableRank}>{index + 1}.</span>
                                            {opt.url_imagen && <img src={opt.url_imagen} alt={opt.name} className={styles.shareableImg} crossOrigin="anonymous" />}
                                            <span className={styles.shareableName}>{opt.name}</span>
                                            <span className={styles.shareableCount}>{isProject ? `${(opt.count as number).toFixed(2)} pts` : `${opt.count} votos`}</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}