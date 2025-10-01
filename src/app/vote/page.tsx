'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import styles from './page.module.css'
import Swal from 'sweetalert2'
import { LogIn, User } from 'lucide-react'

// Interfaces para tipado fuerte
interface Student {
  id_alumno: number;
  carne: string;
  nombre_completo: string;
}

interface Poll {
  id_encuesta: number;
  titulo: string;
  estado: string;
  codigo_acceso: string;
  hasVoted?: boolean;
}

export default function StudentVoteEntryPage() {
  const [carneInput, setCarneInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true);
  const router = useRouter()

  const [loggedInStudent, setLoggedInStudent] = useState<Student | null>(null);
  const [activePolls, setActivePolls] = useState<Poll[]>([]);
  const [inactivePolls, setInactivePolls] = useState<Poll[]>([]);

  useEffect(() => {
    try {
      const storedStudent = localStorage.getItem('currentStudent');
      if (storedStudent) {
        setLoggedInStudent(JSON.parse(storedStudent));
      }
    } catch (e) {
      console.error("Error al leer localStorage", e);
      localStorage.removeItem('currentStudent');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loggedInStudent) {
      const fetchPolls = async () => {
        setLoading(true);
        setError(null);

        try {
          const { data: tipoData } = await supabase
              .from('tipos_votacion').select('id_tipo_votacion').eq('nombre', 'Proyectos').single();
          
          if (!tipoData) throw new Error("No se pudo encontrar el tipo de encuesta 'Proyectos'.");

          const { data: polls, error: pollsError } = await supabase
            .from('encuestas')
            .select('id_encuesta, titulo, estado, codigo_acceso')
            .eq('id_tipo_votacion', tipoData.id_tipo_votacion);
          
          if (pollsError) throw pollsError;

          const { data: studentVotes } = await supabase
              .from('votos_alumnos')
              .select('id_encuesta')
              .eq('id_alumno', loggedInStudent.id_alumno);
          
          const votedPollIds = new Set(studentVotes?.map(v => v.id_encuesta) || []);

          const activas: Poll[] = [];
          const inactivas: Poll[] = [];
          
          polls.forEach(poll => {
              const pollWithVoteStatus = { ...poll, hasVoted: votedPollIds.has(poll.id_encuesta) };
              if (poll.estado === 'activa') {
                  activas.push(pollWithVoteStatus);
              } else {
                  inactivas.push(pollWithVoteStatus);
              }
          });

          setActivePolls(activas);
          setInactivePolls(inactivas);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
      };

      fetchPolls();
    }
  }, [loggedInStudent]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCarne = carneInput.trim();
    if (!trimmedCarne) {
      setError('Por favor ingresa tu número de carné.');
      return;
    }
    setLoading(true);
    setError(null);
    
    try {
        const { data: student, error: dbError } = await supabase
            .from('alumnos')
            .select('*')
            .eq('carne', trimmedCarne)
            .single();

        if (dbError || !student) {
            throw new Error('Número de carné no encontrado. Verifica tus datos.');
        }
        
        localStorage.setItem('currentStudent', JSON.stringify(student));
        setLoggedInStudent(student);

    } catch (err: any) {
        setError(err.message);
    } finally {
        setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('currentStudent');
    setLoggedInStudent(null);
    setActivePolls([]);
    setInactivePolls([]);
    setCarneInput('');
  };

  const handleVoteClick = (poll: Poll) => {
    if (poll.hasVoted) {
      Swal.fire({
        icon: 'info',
        title: 'Ya has votado',
        text: 'Solo puedes votar una vez en esta encuesta.',
      });
    } else {
      sessionStorage.setItem('votingStudent', JSON.stringify(loggedInStudent));
      router.push(`/vote/${poll.codigo_acceso}`);
    }
  };

  if (loading && !loggedInStudent) {
    return <p className={styles.info}>Cargando...</p>;
  }

  if (loggedInStudent) {
    return (
      <div className={styles.container}>
        <div className={styles.welcomeHeader}>
          <div className={styles.welcomeUser}>
            <User />
            <h1 className={styles.title}>Bienvenido, {loggedInStudent.nombre_completo}</h1>
          </div>
          <button onClick={handleLogout} className={styles.logoutButton}>Cambiar Carné</button>
        </div>

        {loading ? <p className={styles.info}>Cargando encuestas...</p> : (
            <>
                <div className={styles.pollList}>
                    <h2 className={styles.listTitle}>Encuestas Activas</h2>
                    {activePolls.length > 0 ? (
                        activePolls.map(poll => (
                            <div key={poll.id_encuesta} className={styles.pollItem}>
                                <span>{poll.titulo}</span>
                                <button 
                                    onClick={() => handleVoteClick(poll)}
                                    className={poll.hasVoted ? styles.votedButton : styles.voteButton}
                                    disabled={poll.hasVoted}
                                >
                                    {poll.hasVoted ? 'Ya Votaste' : 'Votar'}
                                </button>
                            </div>
                        ))
                    ) : (
                        <p className={styles.noPollsMessage}>No hay encuestas activas en este momento.</p>
                    )}
                </div>

                <div className={styles.pollList}>
                    <h2 className={styles.listTitle}>Encuestas Inactivas</h2>
                    {inactivePolls.length > 0 ? (
                        inactivePolls.map(poll => (
                            <div key={poll.id_encuesta} className={`${styles.pollItem} ${styles.inactive}`}>
                                <span>{poll.titulo}</span>
                                <span className={styles.statusLabel}>Inactiva</span>
                            </div>
                        ))
                    ) : (
                        <p className={styles.noPollsMessage}>No hay encuestas Inactiva.</p>
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
        <h1 className={styles.title}>Acceso para Estudiantes</h1>
        <form onSubmit={handleLogin} className={styles.form}>
          <p>Ingresa tu número de carné para ver las encuestas disponibles.</p>
          <input
            type="text"
            value={carneInput}
            onChange={e => {
              setCarneInput(e.target.value)
              setError(null)
            }}
            placeholder="Ej: 1190-21-1111"
            className={styles.input}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.button}>
            <LogIn size={18}/> Ingresar
          </button>
        </form>
      </div>
    </div>
  )
}