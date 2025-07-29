// src/app/dashboard/polls/[id]/edit/page.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '../../../../../lib/supabaseClient'
import styles from './page.module.css'

interface PollDetail {
  titulo: string
  descripcion: string | null
}

interface Option {
  id_opcion?: number
  texto_opcion: string
  url_imagen: string | null
}

export default function EditPollPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const pollId = Number(id)

  const [titulo, setTitulo]           = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [opciones, setOpciones]       = useState<Option[]>([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user.id) {
        router.replace('/auth/login')
        return
      }

      const { data: poll, error: pollError } = await supabase
        .from('encuestas')
        .select('titulo, descripcion')
        .eq('id_encuesta', pollId)
        .single()
      if (pollError || !poll) {
        alert('Error al cargar encuesta: ' + pollError?.message)
        return
      }
      setTitulo(poll.titulo)
      setDescripcion(poll.descripcion || '')

      const { data: opts, error: optsError } = await supabase
        .from('opciones_encuesta')
        .select('id_opcion, texto_opcion, url_imagen')
        .eq('id_encuesta', pollId)
        .order('id_opcion', { ascending: true })
      if (optsError) {
        alert('Error al cargar opciones: ' + optsError.message)
        return
      }
      setOpciones(
        opts.map(o => ({
          id_opcion:    o.id_opcion,
          texto_opcion: o.texto_opcion,
          url_imagen:   o.url_imagen
        }))
      )
      setLoading(false)
    })()
  }, [pollId, router])

  const handleOptionChange = (idx: number, texto_opcion: string) => {
    const arr = [...opciones]
    arr[idx].texto_opcion = texto_opcion
    setOpciones(arr)
  }

  const handleImageChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const arr = [...opciones]
      arr[idx].url_imagen = reader.result as string
      setOpciones(arr)
    }
    reader.readAsDataURL(file)
  }

  const addOption = () => {
    setOpciones([...opciones, { texto_opcion: '', url_imagen: null }])
  }

  const removeOption = (idx: number) => {
    setOpciones(opciones.filter((_, i) => i !== idx))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    // 1) Actualizar encuesta
    const { error: updateError } = await supabase
      .from('encuestas')
      .update({ titulo, descripcion })
      .eq('id_encuesta', pollId)
    if (updateError) {
      alert('Error al actualizar encuesta: ' + updateError.message)
      setSaving(false)
      return
    }

    // 2) Borrar opciones antiguas
    const { error: deleteError } = await supabase
      .from('opciones_encuesta')
      .delete()
      .eq('id_encuesta', pollId)
    if (deleteError) {
      alert('Error al borrar opciones viejas: ' + deleteError.message)
      setSaving(false)
      return
    }

    // 3) Insertar nuevas opciones (con su imagen si la hay)
    const inserts = opciones
      .filter(o => o.texto_opcion.trim())
      .map(o => ({
        id_encuesta:  pollId,
        texto_opcion: o.texto_opcion.trim(),
        url_imagen:   o.url_imagen
      }))
    if (inserts.length) {
      const { error: insertError } = await supabase
        .from('opciones_encuesta')
        .insert(inserts)
      if (insertError) {
        alert('Error al insertar opciones: ' + insertError.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    router.push(`/dashboard/polls/${pollId}`)
  }

  if (loading) return <p className={styles.info}>Cargando...</p>

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Editar encuesta</h1>
      <form onSubmit={handleSave} className={styles.form}>
        <div className={styles.field}>
          <label>Título</label>
          <input
            type="text"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            required
          />
        </div>

        <div className={styles.field}>
          <label>Descripción</label>
          <textarea
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
          />
        </div>

        <fieldset className={styles.fieldset}>
          <legend>Opciones</legend>
          {opciones.map((opt, i) => (
            <div key={i} className={styles.optionRow}>
              <input
                type="text"
                value={opt.texto_opcion}
                onChange={e => handleOptionChange(i, e.target.value)}
                required
              />
              <input
                type="file"
                accept="image/*"
                onChange={e => handleImageChange(i, e)}
              />
              {opt.url_imagen && (
                <img
                  src={opt.url_imagen}
                  alt="Preview"
                  className={styles.optionImg}
                />
              )}
              <button type="button" onClick={() => removeOption(i)}>
                Eliminar
              </button>
            </div>
          ))}
          <button type="button" onClick={addOption}>
            + Agregar opción
          </button>
        </fieldset>

        <button type="submit" disabled={saving} className={styles.submitBtn}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}
