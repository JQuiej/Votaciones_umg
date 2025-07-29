// src/app/dashboard/polls/[id]/page.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabaseClient'
import QRCode from 'react-qr-code'
import styles from './page.module.css'

interface PollDetail {
  id_encuesta:    number
  titulo:         string
  descripcion:    string | null
  estado:         string
  url_votacion:   string
  codigo_acceso:  string
}

interface Option {
  id_opcion:    number
  texto_opcion: string
  url_imagen:   string | null
}

export default function PollDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const pollId = Number(id)

  const [poll, setPoll]       = useState<PollDetail | null>(null)
  const [options, setOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Estados para editar status (igual que antes)...
  const [newStatus, setNewStatus]   = useState<string>('pending')
  const [updating, setUpdating]     = useState(false)
  const statusOptions = ['Pendiente','Activa','Terminada','Cancelada']

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      // 1) Verificar sesión
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user.id) {
        router.replace('/auth/login')
        return
      }

      // 2) Traer encuesta incluyendo url_votacion y codigo_acceso
      const { data: pd, error: pe } = await supabase
        .from('encuestas')
        .select(`
          id_encuesta,
          titulo,
          descripcion,
          estado,
          url_votacion,
          codigo_acceso
        `)
        .eq('id_encuesta', pollId)
        .single()
      if (pe) {
        setError(pe.message)
        setLoading(false)
        return
      }
      setPoll(pd)
      setNewStatus(pd.estado)

      // 3) Cargar opciones
      const { data: ods, error: oe } = await supabase
        .from('opciones_encuesta')
        .select('id_opcion, texto_opcion, url_imagen')
        .eq('id_encuesta', pollId)
      if (oe) setError(oe.message)
      else setOptions(ods || [])

      setLoading(false)
    })()
  }, [pollId, router])

  const handleStatusChange = async () => {
    if (!poll || newStatus === poll.estado) return
    setUpdating(true)
    const { error } = await supabase
      .from('encuestas')
      .update({ estado: newStatus })
      .eq('id_encuesta', pollId)
    if (error) alert('Error al actualizar: ' + error.message)
    else setPoll(p => p && { ...p, estado: newStatus })
    setUpdating(false)
  }

  if (loading) return <p className={styles.info}>🔄 Cargando encuesta…</p>
  if (error)   return <p className={styles.error}>Error: {error}</p>
  if (!poll)  return <p className={styles.info}>Encuesta no encontrada.</p>

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{poll.titulo}</h1>
        <div className={styles.actions}>
          <button
            onClick={() => router.push(`/dashboard/polls/${pollId}/edit`)}
            className={styles.editButton}
          >
            Editar
          </button>
        </div>
      </header>

      {poll.descripcion && (
        <p className={styles.description}>{poll.descripcion}</p>
      )}

      {/* Selector de estado */}
      <div className={styles.field}>
        <label htmlFor="statusSelect">Estado:</label>
        <select
          id="statusSelect"
          value={newStatus}
          onChange={e => setNewStatus(e.target.value)}
          className={styles.select}
          disabled={updating}
        >
          {statusOptions.map(s => (
            <option key={s} value={s.toLowerCase()}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={handleStatusChange}
          className={styles.updateStatusBtn}
          disabled={updating || newStatus === poll.estado}
        >
          {updating ? 'Actualizando…' : 'Actualizar estado'}
        </button>
      </div>

      <p className={styles.meta}>
        Estado actual: <strong>{poll.estado}</strong>
      </p>

      <h2>Opciones</h2>
      <ul className={styles.optionList}>
        {options.map(opt => (
          <li key={opt.id_opcion} className={styles.optionItem}>
            <span>{opt.texto_opcion}</span>
            {opt.url_imagen && (
              <img
                src={opt.url_imagen}
                alt={opt.texto_opcion}
                className={styles.optionImg}
              />
            )}
          </li>
        ))}
      </ul>

      {/* QR & Código de acceso */}
      <div className={styles.qrContainer}>
        <QRCode
          value={poll.url_votacion}
          size={128}
        />
        <p className={styles.accessCode}>
          Código de acceso:<br />
          <code>{poll.codigo_acceso}</code>
        </p>
      </div>
    </div>
  )
}
