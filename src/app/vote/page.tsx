'use client'

import React, { useState, useEffect, useCallback, Suspense } from 'react' // Asegúrate de importar Suspense aquí
import { useRouter, useSearchParams } from 'next/navigation' // <-- Importar useSearchParams
import { supabase } from '../../lib/supabaseClient'
import styles from './page.module.css'
import Swal from 'sweetalert2'
import { LogIn, User, Image as ImageIcon } from 'lucide-react'
import Image from 'next/image'

// --- Nuevo Export Default ---
export default function VotePage() {
    return (
        // 🛑 Esto le dice a Next.js que espere al cliente para ejecutar useSearchParams()
        <Suspense fallback={<div>Cargando portal...</div>}>
            <UniversalVoteEntryPage />
        </Suspense>
    )
}
// --- Interfaces ---
interface Student {
  id_alumno: number;
  carne: string;
  nombre_completo: string;
}
interface Judge {
    id_juez: number;
    nombre_completo: string;
    codigo_unico: string;
}
type LoggedInUser = Student | Judge;

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

// --- Componente Principal ---
function UniversalVoteEntryPage() { 
  const [accessKey, setAccessKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true);
  const router = useRouter()

  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);
  const [assignedPolls, setAssignedPolls] = useState<Poll[]>([]);
  const [publicPolls, setPublicPolls] = useState<Poll[]>([]);
  const [inactivePolls, setInactivePolls] = useState<Poll[]>([]);
  const searchParams = useSearchParams(); // Hook para leer parámetros de la URL

    // Lógica de inicio de sesión, ahora separada para ser reutilizable
  const performLogin = useCallback(async (loginKey: string) => {
    setLoading(true);
    setError(null);
    try {
      let userToLogin: LoggedInUser | null = null;
      const { data: judgeByCode } = await supabase.from('jueces').select('*').eq('codigo_unico', loginKey).single();
      if (judgeByCode) {
        userToLogin = judgeByCode;
      } else {
        const { data: student } = await supabase.from('alumnos').select('*').eq('carne', loginKey).single();
        if (student) userToLogin = student;
      }
      
      if (userToLogin) {
        localStorage.setItem('currentUser', JSON.stringify(userToLogin));
        setLoggedInUser(userToLogin);
        // Limpia la URL para que el código no quede visible
        router.replace('/vote');
      } else {
        throw new Error('Credenciales no encontradas. Verifica tus datos.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Efecto para autologin si se llega con un código en la URL
  useEffect(() => {
    const codeFromURL = searchParams.get('code');
    // Si hay un código en la URL y nadie ha iniciado sesión, intenta el autologin
    if (codeFromURL && !loggedInUser) {
      setAccessKey(codeFromURL); // Pone el código en el campo de texto (opcional)
      performLogin(codeFromURL); // Intenta iniciar sesión automáticamente
    }
  }, [searchParams, loggedInUser, performLogin]);
  
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('currentUser');
      if (storedUser) {
        setLoggedInUser(JSON.parse(storedUser));
      }
    } catch (e) {
      console.error("Error al leer localStorage", e);
      localStorage.removeItem('currentUser');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPolls = useCallback(async (user: LoggedInUser) => {
    setLoading(true);
    setError(null);
    try {
      const { data: allPolls, error: pollsError } = await supabase
        .from('encuestas')
        .select('id_encuesta, titulo, descripcion, estado, codigo_acceso, preguntas_encuesta(url_imagen,texto_pregunta)')
        .eq('id_tipo_votacion', 4);

      if (pollsError) throw pollsError;

      const userId = 'id_alumno' in user ? user.id_alumno : user.id_juez;
      const userColumn = 'id_alumno' in user ? 'id_alumno' : 'id_juez';

      const { data: userVotes, error: votesError } = await supabase.from('votos_respuestas').select('id_encuesta').eq(userColumn, userId);
      if (votesError) throw votesError;
      const votedPollIds = new Set(userVotes?.map(v => v.id_encuesta) || []);

      let assignedPollIds = new Set<number>();
      let assignmentMap = new Map<number, string>();
      if ('id_juez' in user) {
        const { data: assignments } = await supabase.from('encuesta_jueces').select('id_encuesta, codigo_acceso_juez').eq('id_juez', user.id_juez);
        assignedPollIds = new Set(assignments?.map(a => a.id_encuesta));
        assignmentMap = new Map(assignments?.map(a => [a.id_encuesta, a.codigo_acceso_juez]));
      }

      const assigned: Poll[] = [];
      const publicView: Poll[] = [];
      const inactive: Poll[] = [];

      allPolls.forEach(poll => {
        const pollData: Poll = {
            ...poll,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore // O // @ts-expect-error, ya no importa cuál uses aquí
            url_imagen: poll.preguntas_encuesta[0]?.url_imagen || null,
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore // O // @ts-expect-error
            texto_pregunta: poll.preguntas_encuesta[0]?.texto_pregunta || null,
            hasVoted: votedPollIds.has(poll.id_encuesta),
        };

        if (poll.estado !== 'activa') {
          inactive.push(pollData);
        } else if ('id_juez' in user && assignedPollIds.has(poll.id_encuesta)) {
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
    if (loggedInUser) {
      fetchPolls(loggedInUser);
      const channel = supabase.channel('public:encuestas')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'encuestas' },
          () => fetchPolls(loggedInUser)
        ).subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [loggedInUser, fetchPolls]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = accessKey.trim();
    if (!trimmedInput) {
      setError('Por favor, ingresa tus credenciales.');
      return;
    }
    setLoading(true);
    setError(null);
    
    try {
      let userToLogin: LoggedInUser | null = null;
      const { data: judgeByCode } = await supabase.from('jueces').select('*').eq('codigo_unico', trimmedInput).single();
      if (judgeByCode) {
        userToLogin = judgeByCode;
      } else {
        const { data: student } = await supabase.from('alumnos').select('*').eq('carne', trimmedInput).single();
        if (student) userToLogin = student;
      }
      
      if (userToLogin) {
        localStorage.setItem('currentUser', JSON.stringify(userToLogin));
        setLoggedInUser(userToLogin);
      } else {
        throw new Error('Credenciales no encontradas. Verifica tus datos.');
      }
    } catch (err: any) {
        setError(err.message);
    } finally {
        setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    setLoggedInUser(null);
  };

  // --- FUNCIÓN CORREGIDA ---
  const handleVoteClick = (poll: Poll, isJudgeVote: boolean) => {
    if (poll.hasVoted) {
      Swal.fire({ icon: 'info', title: 'Ya has votado', text: 'Solo puedes votar una vez por encuesta.' });
      return;
    }
    sessionStorage.setItem('votingUser', JSON.stringify(loggedInUser));
    
    // Decide qué código de acceso usar basado en el botón que se presionó
    const accessCode = isJudgeVote ? poll.codigo_acceso_juez : poll.codigo_acceso;
    
    if (!accessCode) {
        Swal.fire('Error', 'No se encontró un código de acceso válido para esta votación.', 'error');
        return;
    }

    // 🛑 CAMBIO CLAVE: SIEMPRE REDIRIGE A LA RUTA ORIGINAL /vote/
    router.push(`/vote/${accessCode}`);
};

  if (loading && !loggedInUser) return <p className={styles.info}>Cargando...</p>;

  if (loggedInUser) {
    return (
      <div className={styles.container}>
        <div className={styles.welcomeHeader}>
          <div className={styles.welcomeUser}>
            <User />
            <h1 className={styles.title}>Bienvenido, {loggedInUser.nombre_completo}</h1>
          </div>
          <button onClick={handleLogout} className={styles.logoutButton}>Cerrar Sesión</button>
        </div>

        {loading ? <p className={styles.info}>Buscando encuestas...</p> : (
            <>
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
                                {/* --- LLAMADA A LA FUNCIÓN CORREGIDA --- */}
                                <button onClick={() => handleVoteClick(poll, true)} className={poll.hasVoted ? styles.votedButton : styles.voteButton} disabled={poll.hasVoted}>
                                    {poll.hasVoted ? 'Ya Votaste' : 'Votar como Juez'}
                                </button>
                            </div>
                        ))
                    ) : <p className={styles.noPollsMessage}>No tienes encuestas asignadas. La lista se actualizará automáticamente.</p>}
                </div>
              )}

              <div className={styles.pollList}>
                  <h2 className={styles.listTitle}>Encuestas Abiertas al Público</h2>
                  {publicPolls.length > 0 ? (
                      publicPolls.map(poll => (
                           <div key={poll.id_encuesta} className={styles.pollItem}>
                              {poll.url_imagen ? <Image src={poll.url_imagen} alt={poll.titulo} width={80} height={80} className={styles.pollImage} /> : <div className={styles.imagePlaceholder}><ImageIcon /></div>}
                              <div className={styles.pollInfo}>
                                  {poll.texto_pregunta && <p className={styles.pollQuestionText}>{poll.texto_pregunta}</p>}
                                  <span className={styles.pollTitle}>{poll.titulo}</span>
                                  {poll.descripcion && <p className={styles.pollDescription}>{poll.descripcion}</p>}
                              </div>
                              {/* --- LLAMADA A LA FUNCIÓN CORREGIDA --- */}
                              <button onClick={() => handleVoteClick(poll, false)} className={poll.hasVoted ? styles.votedButton : styles.voteButton} disabled={poll.hasVoted}>
                                  {poll.hasVoted ? 'Ya Votaste' : 'Votar como Público'}
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
            </>
        )}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.loginCard}>
        <h1 className={styles.title}>Portal de Votación</h1>
        <form onSubmit={handleLogin} className={styles.form}>
          <p>Ingresa tu carné de estudiante o tu código único de juez.</p>
          <input
            type="text"
            value={accessKey}
            onChange={e => { setAccessKey(e.target.value); setError(null); }}
            placeholder="Carné o Código de Juez"
            className={styles.input}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.button} disabled={loading}>
            <LogIn size={18}/> {loading ? 'Verificando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}