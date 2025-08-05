// src/app/dashboard/polls/[id]/page.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image' // Importar Image de Next.js
import { supabase } from '../../../../lib/supabaseClient'
import { QRCodeCanvas as QRCode } from 'qrcode.react'
import Swal from 'sweetalert2' // Importar SweetAlert2
import styles from './page.module.css'

interface PollDetail {
  id_encuesta: number
  id_tipo_votacion: number
  titulo: string
  descripcion: string | null
  estado: string
  url_votacion: string
  codigo_acceso: string
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
    </div>
  )
}