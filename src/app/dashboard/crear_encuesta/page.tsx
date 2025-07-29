// src/app/dashboard/crear_encuesta/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import styles from './page.module.css'

interface PollType {
  id_tipo_votacion: number
  nombre:           string
  descripcion:      string
}

export default function SelectPollTypePage() {
  const [types, setTypes] = useState<PollType[]>([])
  const router = useRouter()

  useEffect(() => {
    supabase
      .from('tipos_votacion')
      .select('*')
      .then(({ data, error }) => {
        if (error) console.error(error)
        else setTypes(data || [])
      })
  }, [])

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Selecciona el tipo de encuesta</h1>
      <ul className={styles.list}>
        {types.map((type) => (
          <li key={type.id_tipo_votacion} className={styles.item}>
            <button
              className={styles.button}
              onClick={() =>
                router.push(
                  `/dashboard/crear_encuesta/${type.id_tipo_votacion}`
                )
              }
            >
              <strong className={styles.title}>{type.nombre}</strong>
              <p className={styles.description}>{type.descripcion}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
