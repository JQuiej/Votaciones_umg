// ./src/app/vote/[codigo_acceso]/VoteContent.tsx
'use client' 

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient'; 
import Swal from 'sweetalert2';
// ... (otros imports que necesites)

// 🛑 ID de Candidatas (DEBE COINCIDIR CON TU BASE DE DATOS)
const CANDIDATE_VOTING_TYPE_ID = 2; 

// --- Interfaces Necesarias ---
interface PollDetails {
    id_encuesta: number;
    titulo: string;
    id_tipo_votacion: number;
    // ... (otras propiedades)
    // 🛑 Añade las relaciones anidadas aquí (asumiendo que las traes en el SELECT)
    candidatos?: Candidate[]; 
    preguntas_encuesta?: any[];
}
interface Candidate {
    id_candidato: number;
    nombre: string;
    propuesta: string;
    url_imagen: string;
}
// ----------------------------

// --- Componente: Interfaz de Votación de Candidatos ---
function CandidateView({ pollData, votingUser, onVoteSubmit }: { pollData: PollDetails, votingUser: any, onVoteSubmit: (candidateId: number) => Promise<void> }) {
    const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);

    const candidates = pollData.candidatos || [];

    return (
        <div className="candidate-vote-ui" style={{ padding: '20px', maxWidth: '600px', margin: 'auto' }}>
            <h1>Votación de Candidatas: {pollData.titulo}</h1>
            <p>Alumno: {votingUser.nombre_completo}. Selecciona a tu candidata favorita.</p>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'center' }}>
                {candidates.map(candidate => (
                    <div 
                        key={candidate.id_candidato} 
                        onClick={() => setSelectedCandidateId(candidate.id_candidato)}
                        style={{ 
                            border: `2px solid ${selectedCandidateId === candidate.id_candidato ? 'purple' : '#ccc'}`, 
                            padding: '10px', 
                            borderRadius: '8px', 
                            cursor: 'pointer',
                            width: '150px',
                            textAlign: 'center'
                        }}
                    >
                        <img src={candidate.url_imagen} alt={candidate.nombre} style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '50%' }} />
                        <h3>{candidate.nombre}</h3>
                        <p style={{ fontSize: '0.8em', color: '#666' }}>{candidate.propuesta}</p>
                    </div>
                ))}
            </div>

            <button 
                onClick={() => selectedCandidateId && onVoteSubmit(selectedCandidateId)}
                disabled={!selectedCandidateId}
                style={{ marginTop: '20px', padding: '10px 20px', background: 'purple', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
            >
                Votar por Candidata
            </button>
        </div>
    );
}

// --- Componente: Interfaz de Votación de Preguntas (Tu Lógica Existente) ---
function QuestionView({ pollData, votingUser }: { pollData: PollDetails, votingUser: any }) {
    // 🛑 Aquí debería ir TODA TU LÓGICA Y JSX para el formulario de preguntas/encuestas generales
    // Usa pollData.preguntas_encuesta para mostrar las preguntas.
    
    // EJEMPLO MÍNIMO:
    return (
        <div className="question-vote-ui" style={{ padding: '20px' }}>
            <h1>Encuesta General: {pollData.titulo}</h1>
            <p>Usuario: {votingUser.nombre_completo}. Responde las preguntas a continuación.</p>
            {/* Aquí va tu formulario complejo de votación de preguntas/opciones */}
            
            {/* Si no tienes un componente QuestionView, reemplaza esto con tu código de formulario original */}
            <div style={{ border: '1px solid gray', padding: '15px' }}>
                <p>Tu formulario de preguntas/opciones va aquí...</p>
                {pollData.preguntas_encuesta?.map((q, index) => (
                    <div key={index}>{q.texto_pregunta}</div>
                ))}
            </div>
        </div>
    );
}

// --- Componente Principal (Decisor) ---
export default function VoteContent({ params }: { params: { codigo_acceso: string } }) {
    const router = useRouter();
    const accessCode = params.codigo_acceso;
    const [loading, setLoading] = useState(true);
    const [pollData, setPollData] = useState<PollDetails | null>(null);
    const [votingUser, setVotingUser] = useState<any>(null);

    // 🛑 Función para enviar el voto del CANDIDATO
    const handleCandidateVoteSubmit = useCallback(async (candidateId: number) => {
        if (!pollData || !votingUser || !('id_alumno' in votingUser)) {
            Swal.fire('Error', 'Datos de usuario o votación inválidos.', 'error');
            return;
        }

        try {
            // Asegúrate de que el alumno no haya votado ya en esta encuesta
            const { data: existingVote } = await supabase
                .from('votos_respuestas')
                .select('id_voto')
                .eq('id_encuesta', pollData.id_encuesta)
                .eq('id_alumno', votingUser.id_alumno)
                .single();
            
            if (existingVote) {
                 Swal.fire('Advertencia', 'Ya has votado en esta elección.', 'warning');
                 router.push('/vote');
                 return;
            }

            // Inserción del voto (Ajusta la tabla y columnas a tu diseño real)
            const { error } = await supabase
                .from('votos_respuestas') // Asumiendo que usas la misma tabla para registrar el voto
                .insert({
                    id_encuesta: pollData.id_encuesta,
                    id_alumno: votingUser.id_alumno,
                    // 🛑 Clave: Usar id_candidato en lugar de id_pregunta/id_opcion
                    id_candidato: candidateId, 
                    // El resto de campos necesarios...
                });
            
            if (error) throw error;

            Swal.fire('Éxito', '¡Tu voto ha sido registrado!', 'success');
            router.push('/vote');
        } catch (error: any) {
            console.error('Error al registrar voto:', error);
            Swal.fire('Error', 'Error al registrar el voto. ' + (error.message || ''), 'error');
        }
    }, [pollData, votingUser, router]);


    const loadPollData = useCallback(async () => {
        setLoading(true);
        const storedUser = JSON.parse(sessionStorage.getItem('votingUser') || 'null');
        setVotingUser(storedUser);

        if (!storedUser) {
            Swal.fire('Error', 'Debes iniciar sesión para votar.', 'error');
            router.push('/vote');
            return;
        }

        try {
            // 🛑 Select mejorado para traer CANDIDATOS y PREGUNTAS
            const { data: poll, error: pollError } = await supabase
                .from('encuestas')
                .select(`
                    *, 
                    preguntas_encuesta(*), 
                    candidatos(*)
                `)
                .eq('codigo_acceso', accessCode)
                .eq('estado', 'activa')
                .single();

            if (pollError || !poll) throw new Error('Votación no encontrada o inactiva.');
            
            // Verificación de acceso
            const isCandidatePoll = poll.id_tipo_votacion === CANDIDATE_VOTING_TYPE_ID;
            const isJudge = 'id_juez' in storedUser;

            if (isCandidatePoll && isJudge) {
                // Las candidatas solo son votadas por alumnos
                Swal.fire('Acceso Denegado', 'Solo los alumnos pueden votar en esta elección.', 'error');
                router.push('/vote');
                return;
            }
            
            setPollData(poll as PollDetails);

        } catch (error: any) {
            Swal.fire('Error', error.message || 'Error al cargar la votación.', 'error');
        } finally {
            setLoading(false);
        }
    }, [accessCode, router]);

    useEffect(() => {
        loadPollData();
    }, [loadPollData]);

    if (loading) return <div>Cargando votación...</div>;
    if (!pollData || !votingUser) return <div>No se pudo cargar la información.</div>;

    // 🛑 El decidor principal: Renderiza la interfaz correcta
    const isCandidatePoll = pollData.id_tipo_votacion === CANDIDATE_VOTING_TYPE_ID;
    
    return (
        <div className="universal-vote-container">
            {isCandidatePoll ? (
                <CandidateView 
                    pollData={pollData} 
                    votingUser={votingUser} 
                    onVoteSubmit={handleCandidateVoteSubmit} 
                />
            ) : (
                <QuestionView 
                    pollData={pollData} 
                    votingUser={votingUser} 
                    // Pasa aquí tu función para manejar votos de preguntas
                />
            )}
        </div>
    );
}