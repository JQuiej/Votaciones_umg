// src/app/vote/page.tsx
'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import styles from './page.module.css'
import Swal from 'sweetalert2'
import { LogIn, User, Image as ImageIcon } from 'lucide-react'
import Image from 'next/image'
import FingerprintJS from '@fingerprintjs/fingerprintjs'

// --- Interfaces ---
interface Judge {
    id_juez: number;
    nombre_completo: string;
    codigo_unico: string;
}

interface PublicUser {
    visitorId: string;
    nombre_completo: string;
}

type LoggedInUser = Judge | PublicUser;

interface Poll {
  id_encuesta: number;
  titulo: string;
  descripcion: string | null;
  texto_pregunta: string | null;
  url_imagen: string | null;
  estado: string;
  codigo_acceso: string;
  codigo_acceso_juez?: string;
  hasVoted?: boolean;
}

function LoadingFallback() {
    return <div className={styles.info}>Cargando portal de votación...</div>;
}

export default function VotePage() {
    return (
        <Suspense fallback={<LoadingFallback />}>
            <UniversalVoteEntryPage />
        </Suspense>
    )
}

function UniversalVoteEntryPage() {
  const [accessKey, setAccessKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true);
  const router = useRouter()
  const searchParams = useSearchParams();

  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);
  const [assignedPolls, setAssignedPolls] = useState<Poll[]>([]);
  const [publicPolls, setPublicPolls] = useState<Poll[]>([]);
  const [inactivePolls, setInactivePolls] = useState<Poll[]>([]);

  const fetchPolls = useCallback(async (user: LoggedInUser) => {
    setLoading(true);
    setError(null);
    try {
      const { data: allPolls, error: pollsError } = await supabase
        .from('encuestas')
        .select('id_encuesta, titulo, descripcion, estado, codigo_acceso, preguntas_encuesta(url_imagen,texto_pregunta)');

      if (pollsError) throw pollsError;

      let userVotesQuery;
      if ('id_juez' in user) {
        userVotesQuery = supabase.from('votos').select('id_encuesta').eq('id_juez', user.id_juez);
      } else { // Es un PublicUser
        userVotesQuery = supabase.from('votos').select('id_encuesta').eq('huella_dispositivo', user.visitorId);
      }
      const { data: userVotes, error: votesError } = await userVotesQuery;
      if (votesError) throw votesError;

      const votedPollIds = new Set(userVotes?.map(v => v.id_encuesta) || []);
      
      const assigned: Poll[] = [];
      const publicView: Poll[] = [];
      const inactive: Poll[] = [];

      let assignmentMap = new Map<number, string>();
      if ('id_juez' in user) {
        const { data: assignments } = await supabase.from('encuesta_jueces').select('id_encuesta, codigo_acceso_juez').eq('id_juez', user.id_juez);
        if (assignments) {
            assignmentMap = new Map(assignments.map(a => [a.id_encuesta, a.codigo_acceso_juez as string]));
        }
      }

      allPolls.forEach(poll => {
        const pollData: Poll = {
            ...poll,
            url_imagen: poll.preguntas_encuesta[0]?.url_imagen || null,
            texto_pregunta: poll.preguntas_encuesta[0]?.texto_pregunta || null,
            hasVoted: votedPollIds.has(poll.id_encuesta),
        };

        if (poll.estado !== 'activa') {
          inactive.push(pollData);
        } else if ('id_juez' in user && assignmentMap.has(poll.id_encuesta)) {
          assigned.push({ ...pollData, codigo_acceso_juez: assignmentMap.get(poll.id_encuesta) });
        } else {
          publicView.push(pollData);
        }
      });
      
      setAssignedPolls(assigned);
      setPublicPolls(publicView);
      setInactivePolls(inactive);
    } catch (err: any) {
        setError(err.message);
    } finally {
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const code = searchParams.get('code');
      const storedUserStr = localStorage.getItem('currentUser');

      // CASO 1: Hay un código en la URL. Usamos esto para autenticar y sobreescribir localStorage.
      if (code) {
        const { data: judge } = await supabase.from('jueces').select('*').eq('codigo_unico', code).single();
        
        let userToLogin: LoggedInUser;
        if (judge) { // Es un juez
          userToLogin = judge;
        } else { // Es un enlace público, usamos huella digital
          const fp = await FingerprintJS.load();
          const result = await fp.get();
          userToLogin = { visitorId: result.visitorId, nombre_completo: 'Público' };
        }
        
        localStorage.setItem('currentUser', JSON.stringify(userToLogin));
        setLoggedInUser(userToLogin);
        router.replace('/vote'); // Limpiamos la URL
        return;
      }

      // CASO 2: No hay código en la URL, revisamos si hay un usuario guardado.
      if (storedUserStr) {
        setLoggedInUser(JSON.parse(storedUserStr));
        return;
      }

      // CASO 3: No hay código ni usuario guardado. Es un nuevo visitante público.
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      const publicUser: PublicUser = { visitorId: result.visitorId, nombre_completo: 'Público' };
      localStorage.setItem('currentUser', JSON.stringify(publicUser));
      setLoggedInUser(publicUser);
    };

    initialize();
  }, [router, searchParams]);

  // Efecto separado para cargar las encuestas una vez que tenemos un usuario.
  useEffect(() => {
    if (loggedInUser) {
        fetchPolls(loggedInUser);

        const channel = supabase.channel(`polls-for-user-${loggedInUser.nombre_completo}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'encuestas' },
            () => fetchPolls(loggedInUser)
          ).subscribe();
          
        return () => { supabase.removeChannel(channel); };
    }
  }, [loggedInUser, fetchPolls]);

  const handleJudgeFormLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedInput = accessKey.trim();
    if (!trimmedInput) {
      setError('Por favor, ingresa tu código único de juez.');
      return;
    }
    
    setLoading(true);
    const { data: judge } = await supabase.from('jueces').select('*').eq('codigo_unico', trimmedInput).single();
    if (judge) {
        localStorage.setItem('currentUser', JSON.stringify(judge));
        setLoggedInUser(judge);
    } else {
        setError('Código de Juez no encontrado.');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    sessionStorage.removeItem('votingUser');
    setLoggedInUser(null);
    setAssignedPolls([]);
    setPublicPolls([]);
    setInactivePolls([]);
    window.location.href = '/vote'; // Forzar recarga para nueva huella
  };

  const handleVoteClick = (poll: Poll, isJudgeVote: boolean) => {
    if (!loggedInUser) return;
    if (poll.hasVoted) {
      Swal.fire({ icon: 'info', title: 'Ya has votado', text: 'Solo puedes votar una vez por esta encuesta.' });
      return;
    }
    sessionStorage.setItem('votingUser', JSON.stringify(loggedInUser));
    
    const accessCode = isJudgeVote ? poll.codigo_acceso_juez : poll.codigo_acceso;
    
    if (!accessCode) {
        Swal.fire('Error', 'No se encontró un código de acceso válido para esta votación.', 'error');
        return;
    }

    router.push(`/vote/${accessCode}`);
  };

  if (loading || !loggedInUser) {
    return <p className={styles.info}>Cargando portal...</p>;
  }

  // ---- RENDERIZADO DEL PORTAL DE VOTACIÓN -----
  return (
      <div className={styles.container}>
        <div className={styles.welcomeHeader}>
          <div className={styles.welcomeUser}>
            <User />
            <h1 className={styles.title}>Bienvenido, {loggedInUser.nombre_completo}</h1>
          </div>
          <button onClick={handleLogout} className={styles.logoutButton}>Cerrar Sesión</button>
        </div>
        
        {'id_juez' in loggedInUser && (
          <div className={styles.pollList}>
              <h2 className={styles.listTitle}>Encuestas Asignadas como Juez</h2>
              {assignedPolls.length > 0 ? (
                  assignedPolls.map(poll => (
                      <div key={poll.id_encuesta} className={styles.pollItem}>
                          {poll.url_imagen ? <Image src={poll.url_imagen} alt={poll.titulo} width={80} height={80} className={styles.pollImage} /> : <div className={styles.imagePlaceholder}><ImageIcon /></div>}
                          <div className={styles.pollInfo}>
                              {poll.texto_pregunta && <p className={styles.pollQuestionText}>{poll.texto_pregunta}</p>}
                              <span className={styles.pollTitle}>{poll.titulo}</span>
                              {poll.descripcion && <p className={styles.pollDescription}>{poll.descripcion}</p>}
                          </div>
                          <button onClick={() => handleVoteClick(poll, true)} className={poll.hasVoted ? styles.votedButton : styles.voteButton} disabled={poll.hasVoted}>
                              {poll.hasVoted ? 'Ya Votaste' : 'Votar como Juez'}
                          </button>
                      </div>
                  ))
              ) : <p className={styles.noPollsMessage}>No tienes encuestas asignadas. La lista se actualizará automáticamente.</p>}
          </div>
        )}
        <div className={styles.pollList}>
            <h2 className={styles.listTitle}>Encuestas Abiertas</h2>
            {publicPolls.length > 0 ? (
                publicPolls.map(poll => (
                      <div key={poll.id_encuesta} className={styles.pollItem}>
                        {poll.url_imagen ? <Image src={poll.url_imagen} alt={poll.titulo} width={80} height={80} className={styles.pollImage} /> : <div className={styles.imagePlaceholder}><ImageIcon /></div>}
                        <div className={styles.pollInfo}>
                            {poll.texto_pregunta && <p className={styles.pollQuestionText}>{poll.texto_pregunta}</p>}
                            <span className={styles.pollTitle}>{poll.titulo}</span>
                            {poll.descripcion && <p className={styles.pollDescription}>{poll.descripcion}</p>}
                        </div>
                        <button onClick={() => handleVoteClick(poll, false)} className={poll.hasVoted ? styles.votedButton : styles.voteButton} disabled={poll.hasVoted}>
                            {poll.hasVoted ? 'Ya Votaste' : 'Votar'}
                        </button>
                      </div>
                ))
            ) : <p className={styles.noPollsMessage}>No hay encuestas públicas activas en este momento.</p>}
        </div>
        <div className={styles.pollList}>
              <h2 className={styles.listTitle}>Encuestas Finalizadas o Inactivas</h2>
              {inactivePolls.length > 0 ? (
                  inactivePolls.map(poll => (
                      <div key={poll.id_encuesta} className={`${styles.pollItem} ${styles.inactive}`}>
                          {poll.url_imagen ? <Image src={poll.url_imagen} alt={poll.titulo} width={80} height={80} className={styles.pollImage} /> : <div className={styles.imagePlaceholder}><ImageIcon /></div>}
                          <div className={styles.pollInfo}>
                              {poll.texto_pregunta && <p className={styles.pollQuestionText}>{poll.texto_pregunta}</p>}
                              <span className={styles.pollTitle}>{poll.titulo}</span>
                              {poll.descripcion && <p className={styles.pollDescription}>{poll.descripcion}</p>}
                          </div>
                          <span className={styles.statusLabel}>{poll.estado}</span>
                      </div>
                  ))
              ) : (
                  <p className={styles.noPollsMessage}>No hay encuestas en esta categoría.</p>
              )}
          </div>
      </div>
  );
}