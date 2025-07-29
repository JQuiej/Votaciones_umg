// src/app/dashboard/crear_encuesta/[typeId]/page.tsx
'use client'

import React, { useState, useEffect, ChangeEvent } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabaseClient'
import styles from './page.module.css'

interface Candidate {
  name: string
  imageBase64: string
}

export default function CreatePollFormPage() {
  const { typeId } = useParams<{ typeId: string }>()
  const router = useRouter()

  // Estados generales
  const [typeName, setTypeName]       = useState('')
  const [titulo, setTitulo]           = useState('')
  const [descripcion, setDescripcion] = useState('')

  // Modo “Candidatas” (tipoId === '1')
  const [candidates, setCandidates]   = useState<Candidate[]>([
    { name: '', imageBase64: '' },
  ])

  // Otros tipos
  const [opciones, setOpciones]       = useState<string[]>([''])
  const [maxScore, setMaxScore]       = useState(5)

  const isCandidates = Number(typeId) === 1

  // Cargo el nombre del tipo
  useEffect(() => {
    if (!typeId) return
    supabase
      .from('tipos_votacion')
      .select('nombre')
      .eq('id_tipo_votacion', Number(typeId))
      .single()
      .then(({ data }) => {
        if (data?.nombre) setTypeName(data.nombre)
      })
  }, [typeId])

  // Handlers de imagen para candidatas
  const handleCandidateImage = (idx: number, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCandidates(prev => {
        const copy = [...prev]
        copy[idx].imageBase64 = reader.result as string
        return copy
      })
    }
    reader.readAsDataURL(file)
  }

  const addCandidate = () =>
    setCandidates(prev => [...prev, { name: '', imageBase64: '' }])
  const removeCandidate = (idx: number) =>
    setCandidates(prev => prev.filter((_, i) => i !== idx))

  // Envío del formulario
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 1) Sesión actual
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user.id
    if (!userId) {
      router.replace('/auth/login')
      return
    }

        // Al inicio de tu componente (fuera de handleSubmit):
    const generateAccessCode = (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let code = ''
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
    }

    // 1) Generar código de acceso
    const codigoAcceso = generateAccessCode(8)

    // 2) Construir la URL usando la variable de entorno o el origen en runtime
    const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL ||
        (typeof window !== 'undefined' ? window.location.origin : '');
    const votingUrl = `${baseUrl}/vote/${codigoAcceso}`;

    // 3) Insertar encuesta con url_votacion y codigo_acceso
    const { data: encData, error: encError } = await supabase
      .from('encuestas')
      .insert({
        titulo,
        descripcion,
        id_tipo_votacion:    Number(typeId),
        id_usuario_creador:  userId,
        codigo_acceso:       codigoAcceso,
        url_votacion:        votingUrl,
      })
      .select('id_encuesta')
      .single()

    if (encError || !encData) {
      alert('Error al crear encuesta: ' + encError?.message)
      return
    }
    const encuestaId = encData.id_encuesta

    // 4) Insertar opciones
    if (isCandidates) {
      const inserts = candidates
        .filter(c => c.name.trim())
        .map(c => ({
          id_encuesta:   encuestaId,
          texto_opcion:  c.name.trim(),
          url_imagen:    c.imageBase64,
        }))
      const { error: optsError } = await supabase
        .from('opciones_encuesta')
        .insert(inserts)
      if (optsError) {
        alert('Error al crear candidatas: ' + optsError.message)
        return
      }
    } else if (typeName === 'Puntuación') {
      const inserts = Array.from({ length: maxScore }, (_, i) => ({
        id_encuesta:   encuestaId,
        texto_opcion:  String(i + 1),
        url_imagen:    null,
      }))
      const { error: optsError } = await supabase
        .from('opciones_encuesta')
        .insert(inserts)
      if (optsError) {
        alert('Error al crear opciones de puntuación: ' + optsError.message)
        return
      }
    } else {
      const inserts = opciones
        .filter(o => o.trim())
        .map(texto => ({
          id_encuesta:   encuestaId,
          texto_opcion:  texto.trim(),
          url_imagen:    null,
        }))
      if (inserts.length) {
        const { error: optsError } = await supabase
          .from('opciones_encuesta')
          .insert(inserts)
        if (optsError) {
          alert('Error al crear opciones: ' + optsError.message)
          return
        }
      }
    }

    // 5) Redirigir al detalle de la encuesta
    router.push(`/dashboard/polls/${encuestaId}`)
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Crear encuesta: {typeName}</h1>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.label}>Título</label>
          <input
            className={styles.input}
            type="text"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            required
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Descripción</label>
          <textarea
            className={styles.textarea}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
          />
        </div>

        {isCandidates && (
          <>
            <h2 className={styles.subheading}>Candidatas</h2>
            {candidates.map((c, i) => (
              <div key={i} className={styles.candidateCard}>
                {candidates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCandidate(i)}
                    className={styles.removeBtn}
                  >
                    &times;
                  </button>
                )}

                <div className={styles.field}>
                  <label className={styles.label}>Nombre</label>
                  <input
                    className={styles.input}
                    type="text"
                    value={c.name}
                    onChange={e =>
                      setCandidates(prev => {
                        const copy = [...prev]
                        copy[i].name = e.target.value
                        return copy
                      })
                    }
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Imagen</label>
                  <input
                    className={styles.input}
                    type="file"
                    accept="image/*"
                    onChange={e => handleCandidateImage(i, e)}
                  />
                </div>

                {c.imageBase64 && (
                  <img
                    className={styles.previewImg}
                    src={c.imageBase64}
                    alt="Vista previa"
                  />
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addCandidate}
              className={styles.button}
            >
              + Agregar candidata
            </button>
          </>
        )}

        {!isCandidates && (
          <p className={styles.info}>
            Aquí iría el formulario para otros tipos de encuesta (opciones de texto,
            puntuación, etc.).
          </p>
        )}

        <button type="submit" className={styles.submitBtn}>
          Crear encuesta
        </button>
      </form>
    </div>
  )
}
