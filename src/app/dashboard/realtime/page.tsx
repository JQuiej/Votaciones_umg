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

export default function ActivePollsPage() {
  const router = useRouter()
  const [polls, setPolls] = useState<Poll[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchActivePolls = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const userId = session?.user.id
      if (!userId) {
        router.replace('/auth/login')
        return
      }

      // La consulta ahora incluye .eq('estado', 'activa')
      const { data, error } = await supabase
        .from('encuestas')
        .select('id_encuesta, titulo, estado, fecha_creacion')
        .eq('id_usuario_creador', userId)
        .eq('estado', 'activa') // <-- AQUÍ ESTÁ EL NUEVO FILTRO
        .order('fecha_creacion', { ascending: false })

      if (error) {
        console.error('Error fetching active polls:', error)
      } else {
        setPolls(data || [])
      }
      setLoading(false)
    }

    fetchActivePolls()
  }, [router])

  if (loading) {
    return <p className={styles.info}>Cargando encuestas activas…</p>
  }
  
  if (polls.length === 0) {
    return <p className={styles.info}>No tienes encuestas activas en este momento.</p>
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Encuestas Activas</h1>
      <ul className={styles.list}>
        {polls.map((p) => (
          <li key={p.id_encuesta} className={styles.item}>
            <Link
              href={`/dashboard/realtime/${p.id_encuesta}`}
              className={styles.link}
            >
              <span className={styles.title}>{p.titulo}</span>
              <span className={styles.meta}>
                {/* Se puede omitir el estado ya que siempre será "activa" */}
                Creada el: {new Date(p.fecha_creacion).toLocaleDateString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}