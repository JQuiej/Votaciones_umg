// src/app/dashboard/polls/page.tsx
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../../../lib/supabaseClient'
import styles from './page.module.css'

interface Poll {
  id_encuesta:    number
  titulo:         string
  estado:         string
  fecha_creacion: string
}

export default function MyPollsPage() {
  const router = useRouter()
  const [polls, setPolls]     = useState<Poll[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetchPolls = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user.id
    if (!userId) {
      router.replace('/auth/login')
      return
    }

    try {
      const res = await supabase
        .from('encuestas')
        .select('id_encuesta, titulo, estado, fecha_creacion')
        .eq('id_usuario_creador', userId)
        .order('fecha_creacion', { ascending: false })

      if (res.error) throw res.error
      setPolls(res.data as Poll[])
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchPolls()
  }, [fetchPolls])

  if (loading) {
    return <p className={styles.info}>🔄 Cargando tus encuestas…</p>
  }
  if (error) {
    return (
      <div className={styles.error}>
        <p>Error al cargar encuestas: {error}</p>
        <button onClick={fetchPolls} className={styles.button}>
          Reintentar
        </button>
      </div>
    )
  }
  if (polls.length === 0) {
    return (
      <div className={styles.info}>
        <p>No tienes encuestas creadas aún.</p>
        <button
          className={styles.createButton}
          onClick={() => router.push('/dashboard/crear_encuesta')}
        >
          + Crear tu primera encuesta
        </button>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.heading}>Mis encuestas</h1>
        <button
          className={styles.createButton}
          onClick={() => router.push('/dashboard/crear_encuesta')}
        >
          + Nueva encuesta
        </button>
      </header>

      <ul className={styles.list}>
        {polls.map((p) => (
          <li key={p.id_encuesta} className={styles.item}>
            <div
              className={styles.link}
              onClick={() => router.push(`/dashboard/polls/${p.id_encuesta}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && router.push(`/dashboard/polls/${p.id_encuesta}`)}
            >
              <span className={styles.title}>{p.titulo}</span>
              <span className={styles.meta}>
                {new Date(p.fecha_creacion).toLocaleDateString()} — {p.estado}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <button onClick={fetchPolls} className={styles.button}>
        🔄 Refrescar
      </button>
    </div>
  )
}
