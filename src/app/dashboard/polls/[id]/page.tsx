// src/app/dashboard/polls/[id]/page.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabaseClient'
import { QRCodeCanvas as QRCode } from 'qrcode.react'
import styles from './page.module.css'

interface PollDetail {
  id_encuesta:      number
  id_tipo_votacion: number
  titulo:           string
  descripcion:      string | null
  estado:           string
  url_votacion:     string
  codigo_acceso:    string
}

interface Question {
  id_pregunta:    number
  texto_pregunta: string
  url_imagen:     string | null
  opciones: {
    id_opcion:    number
    texto_opcion: string
    url_imagen:   string | null
  }[]
}

export default function PollDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const pollId = Number(id)

  const [poll, setPoll]           = useState<PollDetail | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const [newStatus, setNewStatus] = useState<string>('pendiente')
  const [saving, setSaving]       = useState(false)
  const statusOptions             = ['pendiente', 'activa', 'terminada', 'cancelada']

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      // 1) Verificar sesión
      const { data:{ session } } = await supabase.auth.getSession()
      if (!session?.user.id) {
        router.replace('/auth/login')
        return
      }

      // 2) Traer encuesta
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

      // 3) Cargar preguntas
      const { data: qs, error: qe } = await supabase
        .from('preguntas_encuesta')
        .select('id_pregunta,texto_pregunta,url_imagen')
        .eq('id_encuesta', pollId)
        .order('id_pregunta',{ ascending: true })
      if (qe) {
        setError(qe.message)
        setLoading(false)
        return
      }

      // 4) Cargar opciones por pregunta
      const loaded: Question[] = []
      for (const q of qs || []) {
        const { data: opts, error: oe } = await supabase
          .from('opciones_pregunta')
          .select('id_opcion,texto_opcion,url_imagen')
          .eq('id_pregunta', q.id_pregunta)
          .order('id_opcion',{ ascending: true })
        if (oe) {
          setError(oe.message)
          setLoading(false)
          return
        }
        loaded.push({ ...q, opciones: opts || [] })
      }
      setQuestions(loaded)
      setLoading(false)
    })()
  }, [pollId, router])

  // Cambiar estado
  const handleStatusChange = async () => {
    if (!poll || newStatus === poll.estado) return
    setSaving(true)
    const { error } = await supabase
      .from('encuestas')
      .update({ estado: newStatus })
      .eq('id_encuesta', pollId)
    if (error) {
      alert('Error al actualizar estado: ' + error.message)
      setError('Error al actualizar estado: ' + error.message) // Mostrar error en la UI
    }
    else {
      setPoll(p => p && { ...p, estado: newStatus })
      alert('Estado actualizado a: ' + newStatus.toUpperCase()) // Confirmación
    }
    setSaving(false)
  }

  // Eliminar encuesta
  const handleDelete = async () => {
    // Usar un modal personalizado en lugar de confirm()
    const confirmed = window.confirm('¿Estás seguro de que quieres eliminar esta encuesta? Esta acción es irreversible y eliminará todos los datos asociados (preguntas, opciones, votos).')
    if (!confirmed) return

    const { error } = await supabase
      .from('encuestas')
      .delete()
      .eq('id_encuesta', pollId)
    if (error) {
      alert('Error al eliminar: ' + error.message)
      setError('Error al eliminar: ' + error.message) // Mostrar error en la UI
    }
    else {
      alert('Encuesta eliminada exitosamente.')
      router.push('/dashboard/polls') // Redirigir a la lista de encuestas
    }
  }

  if (loading) return <p className={styles.info}>🔄 Cargando encuesta…</p>
  if (error)   return <p className={styles.error}>Error: {error}</p>
  if (!poll)   return <p className={styles.info}>Encuesta no encontrada.</p>

  // Determinar la URL de votación para el QR
  const voteUrl = typeof window !== 'undefined' ? `${window.location.origin}/vote/${poll.codigo_acceso}` : '';


  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>
          ← Regresar
        </button>
        <h1 className={styles.title}>{poll.titulo}</h1>
        <div className={styles.headerActions}>
          <button
            onClick={() => router.push(`/dashboard/polls/${pollId}/edit`)}
            className={styles.editButton}
          >
            ✏️ Editar
          </button>
          <button onClick={handleDelete} className={styles.deleteButton}>
            🗑️ Eliminar
          </button>
        </div>
      </div>

      {poll.descripcion && (
        <p className={styles.description}>{poll.descripcion}</p>
      )}

      <div className={styles.field}>
        <label htmlFor="pollStatus">Estado:</label>
        <select
          id="pollStatus"
          value={newStatus}
          onChange={e => setNewStatus(e.target.value)}
          disabled={saving}
          className={styles.select}
        >
          {statusOptions.map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <button
          onClick={handleStatusChange}
          disabled={saving || newStatus === poll.estado}
          className={styles.updateStatusBtn}
        >
          {saving ? 'Guardando…' : 'Cambiar estado'}
        </button>
      </div>

      {/** --- PREVIEW PARTICIPANTE --- **/}
      <div className={styles.previewSection}>
        <h2 className={styles.previewTitle}>Vista del Participante</h2>
        <form className={styles.previewForm}>
          {questions.map(q => (
            <fieldset key={q.id_pregunta} className={styles.previewQuestion}>
              <legend>{q.texto_pregunta}</legend>
              {q.url_imagen && (
                <img
                  src={q.url_imagen}
                  alt={q.texto_pregunta}
                  className={styles.questionImg}
                />
              )}

              {/* según tipo */}
              {poll.id_tipo_votacion === 1 && ( // Opción única
                q.opciones.map(o => (
                  <label key={o.id_opcion} className={styles.previewOption}>
                    <input
                      type="radio"
                      name={`q_${q.id_pregunta}`}
                      disabled
                    />
                    {o.url_imagen && <img src={o.url_imagen} alt={o.texto_opcion} className={styles.previewOptionImg} />}
                    <span>{o.texto_opcion}</span>
                  </label>
                ))
              )}
              {poll.id_tipo_votacion === 2 && ( // Opción múltiple
                q.opciones.map(o => (
                  <label key={o.id_opcion} className={styles.previewOption}>
                    <input
                      type="checkbox"
                      name={`q_${q.id_pregunta}`}
                      disabled
                    />
                    {o.url_imagen && <img src={o.url_imagen} alt={o.texto_opcion} className={styles.previewOptionImg} />}
                    <span>{o.texto_opcion}</span>
                  </label>
                ))
              )}
              {poll.id_tipo_votacion === 3 && ( // Puntuación
                <div className={styles.previewScore}>
                  {/* Aquí se asume que las opciones son las etiquetas de puntuación o elementos a puntuar */}
                  {q.opciones.map(o => (
                    <div key={o.id_opcion} className={styles.previewOptionItemScore}>
                      {o.url_imagen && <img src={o.url_imagen} alt={o.texto_opcion} className={styles.previewOptionImg} />}
                      <span className={styles.previewOptionLabel}>{o.texto_opcion}</span>
                    </div>
                  ))}
                  <input
                    type="number" // Cambiado de "range" a "number"
                    min={1}
                    max={10} // Asumiendo un max de 10 para la vista previa
                    value={5} // Valor por defecto para la vista previa
                    disabled
                    className={styles.previewNumber} // Usando la clase para inputs numéricos
                  />
                </div>
              )}
              {poll.id_tipo_votacion === 4 && ( // Ranking
                q.opciones.map(o => (
                  <div key={o.id_opcion} className={styles.previewRank}>
                    <input
                      type="number"
                      min={1}
                      max={q.opciones.length}
                      value={1} // Valor por defecto para la vista previa
                      disabled
                      className={styles.previewNumber}
                    />
                    {o.url_imagen && <img src={o.url_imagen} alt={o.texto_opcion} className={styles.previewOptionImg} />}
                    <span>{o.texto_opcion}</span>
                  </div>
                ))
              )}
            </fieldset>
          ))}
        </form>
      </div>

      {/** QR & código **/}
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
  )
}