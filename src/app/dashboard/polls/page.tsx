'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import styles from './page.module.css'

interface Poll {
  id_encuesta: number
  titulo: string
  estado: string
  fecha_creacion: string
}

export default function MyPollsPage() {
  const router = useRouter()
  const [polls, setPolls] = useState<Poll[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const userId = session?.user.id
      if (!userId) {
        router.replace('/auth/login')
        return
      }

      const { data, error } = await supabase
        .from('encuestas')
        .select('id_encuesta, titulo, estado, fecha_creacion')
        .eq('id_usuario_creador', userId)
        .order('fecha_creacion', { ascending: false })

      if (error) {
        console.error(error)
      } else {
        setPolls(data || [])
      }
      setLoading(false)
    })()
  }, [router])

  if (loading) {
    return <p className={styles.info}>Cargando tus encuestas…</p>
  }
  if (polls.length === 0) {
    return <p className={styles.info}>No tienes encuestas creadas aún.</p>
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Mis encuestas</h1>
      <ul className={styles.list}>
        {polls.map((p) => (
          <li key={p.id_encuesta} className={styles.item}>
            <Link
              href={`/dashboard/polls/${p.id_encuesta}`}
              className={styles.link}
            >
              <span className={styles.title}>{p.titulo}</span>
              <span className={styles.meta}>
                {new Date(p.fecha_creacion).toLocaleDateString()} — {p.estado}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
