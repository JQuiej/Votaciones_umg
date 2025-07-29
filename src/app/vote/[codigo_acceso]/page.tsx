// src/app/vote/[codigo_acceso]/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

export default function VotePage() {
  const { codigo_acceso } = useParams<{ codigo_acceso: string }>()
  const router = useRouter()
  const [poll, setPoll] = useState<any>(null)

  useEffect(() => {
    if (!codigo_acceso) return
    ;(async () => {
      // Buscar encuesta por código de acceso
      const { data, error } = await supabase
        .from('encuestas')
        .select('*')
        .eq('codigo_acceso', codigo_acceso)
        .single()

      if (error || !data) {
        alert('Enlace inválido')
        router.replace('/')
        return
      }
      setPoll(data)
    })()
  }, [codigo_acceso, router])

  if (!poll) return <p>Cargando encuesta…</p>

  return (
    <div style={{ padding: '2rem' }}>
      <h1>{poll.titulo}</h1>
      <p>{poll.descripcion}</p>
      {/* Aquí renderizas las opciones y el formulario de voto */}
    </div>
  )
}
