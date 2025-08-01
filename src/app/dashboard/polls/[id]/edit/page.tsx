// src/app/dashboard/polls/[id]/edit/page.tsx
'use client'

import React, { useState, useEffect, ChangeEvent } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { QRCodeCanvas } from 'qrcode.react' // Asegúrate de que qrcode.react está instalado
import { supabase } from '../../../../../lib/supabaseClient'
import styles from './page.module.css'

interface PollDetail {
  id_encuesta:        number
  id_tipo_votacion:   number
  titulo:             string
  descripcion:        string | null
  codigo_acceso:      string
  url_votacion:       string
}

interface Option {
  id_opcion?:    number
  texto_opcion:  string
  url_imagen?:   string | null
}

interface Question {
  id_pregunta?:       number
  texto_pregunta:    string
  url_imagen?:        string | null
  opciones:          Option[]
  /** used only for scoring */
  maxScore?:          number
}

export default function EditPollPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const pollId = Number(id)

  const [poll, setPoll]             = useState<PollDetail | null>(null)
  const [questions, setQuestions]   = useState<Question[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      // 1) Auth
      const { data:{ session } } = await supabase.auth.getSession()
      if (!session?.user.id) {
        router.replace('/auth/login')
        return
      }

      // 2) Load poll
      const { data: pd, error: pe } = await supabase
        .from('encuestas')
        .select('id_encuesta,id_tipo_votacion,titulo,descripcion,codigo_acceso,url_votacion')
        .eq('id_encuesta', pollId)
        .single()
      if (pe || !pd) {
        setError(pe?.message ?? 'Encuesta no encontrada')
        setLoading(false)
        return
      }
      setPoll(pd)

      // 3) Load questions
      const { data: qs, error: qe } = await supabase
        .from('preguntas_encuesta')
        .select('id_pregunta,texto_pregunta,url_imagen,id_tipo_votacion')
        .eq('id_encuesta', pollId)
        .order('id_pregunta', { ascending: true })
      if (qe) {
        setError(qe.message)
        setLoading(false)
        return
      }

      // 4) For each question load its options
      const loaded: Question[] = []
      for (const q of qs || []) {
        const { data: opts, error: oe } = await supabase
          .from('opciones_pregunta')
          .select('id_opcion,texto_opcion,url_imagen')
          .eq('id_pregunta', q.id_pregunta)
          .order('id_opcion', { ascending: true })
        if (oe) {
          setError(oe.message)
          setLoading(false)
          return
        }
        const opciones = (opts||[]).map(o=>({
          id_opcion: o.id_opcion,
          texto_opcion: o.texto_opcion,
          url_imagen: o.url_imagen
        }))
        // If scoring type, derive maxScore from numeric texts
        let maxScore: number|undefined
        // Si es tipo 3 (Puntuación), se asume que la puntuación máxima se define en la pregunta,
        // no se deriva de las opciones (que podrían ser solo etiquetas).
        // Si no hay un campo 'max_score' en la tabla 'preguntas_encuesta',
        // podrías necesitar un valor por defecto o añadirlo a la base de datos.
        // Por ahora, lo inicializamos a 10 si es un nuevo campo, o lo cargamos si existe.
        // Para este ejemplo, si no viene de la DB, lo pondremos a 10 por defecto para nuevas preguntas.
        if (q.id_tipo_votacion === 3) {
            // Si ya tienes un campo max_score en tu DB para preguntas, cárgalo aquí.
            // Por ahora, si no existe, lo inicializamos a 10.
            maxScore = 10; // Valor por defecto si no se carga de la DB
        }

        loaded.push({
          id_pregunta: q.id_pregunta,
          texto_pregunta: q.texto_pregunta,
          url_imagen: q.url_imagen,
          opciones,
          maxScore
        })
      }
      setQuestions(loaded)
      setLoading(false)
    })()
  }, [pollId, router])

  // Helpers to read images
  const readImage = (cb:(url:string)=>void) => (e:ChangeEvent<HTMLInputElement>)=>{
    const file = e.target.files?.[0]; if(!file) return
    const reader = new FileReader()
    reader.onload = ()=>cb(reader.result as string)
    reader.readAsDataURL(file)
  }

  // Add / remove question
  const addQuestion = () => {
    if (!poll) return
    const blank:Question = {
      texto_pregunta: '',
      url_imagen: null,
      opciones: [{ texto_opcion:'', url_imagen:null }],
      maxScore: poll.id_tipo_votacion===3 ? 10 : undefined // Default maxScore for new scoring questions
    }
    setQuestions(qs => [...qs, blank])
  }
  const removeQuestion = (qi:number) =>
    setQuestions(qs => qs.filter((_,i)=>i!==qi))

  // Add / remove option within question
  const addOption = (qi:number) =>
    setQuestions(qs=>{
      const c = [...qs]
      c[qi].opciones.push({ texto_opcion:'', url_imagen:null })
      return c
    })
  const removeOption = (qi:number, oi:number) =>
    setQuestions(qs=>{
      const c = [...qs]
      c[qi].opciones = c[qi].opciones.filter((_,i)=>i!==oi)
      return c
    })

  // Remove image from question
  const removeQuestionImage = (qi: number) => {
    setQuestions(qs => {
      const newQs = [...qs];
      newQs[qi].url_imagen = null;
      return newQs;
    });
  };

  // Remove image from option
  const removeOptionImage = (qi: number, oi: number) => {
    setQuestions(qs => {
      const newQs = [...qs];
      newQs[qi].opciones[oi].url_imagen = null;
      return newQs;
    });
  };


  // Save handler
  const handleSave = async (e:React.FormEvent) => {
    e.preventDefault()
    if (!poll) return
    setSaving(true)
    setError(null) // Limpiar errores previos

    try {
      // 1) Update poll main data
      const { error: pollUpdateError } = await supabase
        .from('encuestas')
        .update({ titulo: poll.titulo, descripcion: poll.descripcion })
        .eq('id_encuesta', pollId)
      if (pollUpdateError) throw new Error(pollUpdateError.message)

      // 2) Delete all existing questions (cascade deletes options)
      // Esto es un enfoque simple, pero en un sistema de producción,
      // considerar un manejo más sofisticado (upsert/diff) para evitar
      // borrar y recrear todo, lo que podría afectar los resultados existentes
      // si no se manejan con cuidado.
      const { error: deleteQError } = await supabase
        .from('preguntas_encuesta')
        .delete()
        .eq('id_encuesta', pollId)
      if (deleteQError) throw new Error(deleteQError.message)

      // 3) Re-insert each question & its options
      for (const q of questions) {
        // Validar que el texto de la pregunta no esté vacío
        if (!q.texto_pregunta.trim()) {
            throw new Error('Todas las preguntas deben tener un texto.')
        }

        const { data: newQ, error: newQErr } = await supabase
          .from('preguntas_encuesta')
          .insert({
            id_encuesta:      pollId,
            id_tipo_votacion: poll.id_tipo_votacion,
            texto_pregunta:   q.texto_pregunta.trim(),
            url_imagen:       q.url_imagen || null,
            // Si tienes una columna para max_score en preguntas_encuesta, envíala aquí
            // max_score: poll.id_tipo_votacion === 3 ? q.maxScore : null,
          })
          .select('id_pregunta')
          .single()
        if (newQErr || !newQ) {
          throw new Error(`Error al guardar pregunta "${q.texto_pregunta}": ${newQErr?.message}`)
        }

        // options
        const inserts = q.opciones
          .filter(o=>o.texto_opcion.trim()) // Solo insertar opciones con texto
          .map(o=>({
            id_pregunta:      newQ.id_pregunta,
            texto_opcion:     o.texto_opcion.trim(),
            url_imagen:       o.url_imagen || null
          }))
        if (inserts.length) {
          const { error: optErr } = await supabase
            .from('opciones_pregunta')
            .insert(inserts)
          if (optErr) {
            throw new Error(`Error al guardar opciones para pregunta "${q.texto_pregunta}": ${optErr.message}`)
          }
        }
      }

      alert('Cambios guardados exitosamente!')
      router.push(`/dashboard/polls/${pollId}`) // Redirigir a la vista de la encuesta
    } catch (err: any) {
      setError(err.message)
      alert(`Error al guardar: ${err.message}`) // Alerta para el usuario
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className={styles.info}>🔄 Cargando...</p>
  if (error)   return <p className={styles.error}>Error: {error}</p>
  if (!poll)   return null

  // Determinar la URL de votación para el QR
  const voteUrl = typeof window !== 'undefined' ? `${window.location.origin}/vote/${poll.codigo_acceso}` : '';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>
          ← Regresar
        </button>
        <h1 className={styles.title}>Editar Encuesta: {poll.titulo}</h1>
      </div>

      <form onSubmit={handleSave} className={styles.form}>
        {/* Poll title & description */}
        <div className={styles.formGroup}>
          <label htmlFor="pollTitle" className={styles.label}>Título de la Encuesta</label>
          <input
            id="pollTitle"
            type="text"
            value={poll.titulo}
            onChange={e => setPoll(p => p && { ...p, titulo: e.target.value })}
            className={styles.input}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="pollDescription" className={styles.label}>Descripción</label>
          <textarea
            id="pollDescription"
            value={poll.descripcion || ''}
            onChange={e => setPoll(p => p && { ...p, descripcion: e.target.value })}
            className={styles.textarea}
            rows={3}
          />
        </div>


        {/* Type‐specific UI for Questions and Options */}
        {poll.id_tipo_votacion === 1 && (
          // Opcion: single question, just edit opciones
          <fieldset className={styles.questionBlock}>
            <legend className={styles.legend}>Opciones</legend>
            {questions[0]?.opciones.map((opt, oi) => (
              <div key={oi} className={styles.optionRow}>
                <input
                  className={styles.input}
                  value={opt.texto_opcion}
                  onChange={e => {
                    const qs = [...questions]
                    if (qs[0]) qs[0].opciones[oi].texto_opcion = e.target.value
                    setQuestions(qs)
                  }}
                  placeholder={`Opcion #${oi + 1}`}
                  required
                />
                <div className={styles.imageUploadGroup}>
                  <input
                    type="file" accept="image/*"
                    onChange={readImage(url => {
                      const qs = [...questions]
                      if (qs[0]) qs[0].opciones[oi].url_imagen = url
                      setQuestions(qs)
                    })}
                    className={styles.fileInput}
                  />
                  {opt.url_imagen && (
                    <div className={styles.imagePreviewContainer}>
                      <img src={opt.url_imagen} alt="Preview" className={styles.previewImg} />
                      <button type="button" onClick={() => removeOptionImage(0, oi)} className={styles.removeImageBtn}>×</button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeOption(0, oi)}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => addOption(0)}
            >
              + Agregar Opcion
            </button>
          </fieldset>
        )}

        {(poll.id_tipo_votacion === 2 || poll.id_tipo_votacion === 3 || poll.id_tipo_votacion === 4) && (
          <>
            {questions.map((q, qi) => (
              <fieldset key={qi} className={styles.questionBlock}>
                <legend className={styles.legend}>
                  Pregunta #{qi + 1}
                  <button type="button" onClick={() => removeQuestion(qi)} className={styles.removeBtn}>×</button>
                </legend>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Texto de la Pregunta</label>
                  <input
                    className={styles.input}
                    value={q.texto_pregunta}
                    onChange={e => {
                      const qs = [...questions]; qs[qi].texto_pregunta = e.target.value; setQuestions(qs)
                    }}
                    placeholder="Escribe el texto de la pregunta aquí"
                    required
                  />
                </div>
                <div className={styles.imageUploadGroup}>
                  <label className={styles.label}>Imagen de la Pregunta (Opcional)</label>
                  <input
                    type="file" accept="image/*"
                    onChange={readImage(url => {
                      const qs = [...questions]; qs[qi].url_imagen = url; setQuestions(qs)
                    })}
                    className={styles.fileInput}
                  />
                  {q.url_imagen && (
                    <div className={styles.imagePreviewContainer}>
                      <img src={q.url_imagen} alt="Preview" className={styles.previewImg} />
                      <button type="button" onClick={() => removeQuestionImage(qi)} className={styles.removeImageBtn}>×</button>
                    </div>
                  )}
                </div>

                {poll.id_tipo_votacion === 3 && ( // Puntuación específica
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Puntuación máxima</label>
                    <input
                      type="number" min={1}
                      value={q.maxScore || 10} // Valor por defecto si es undefined
                      onChange={e => {
                        const qs = [...questions]
                        qs[qi].maxScore = +e.target.value
                        setQuestions(qs)
                      }}
                      className={styles.input}
                    />
                  </div>
                )}

                {/* Opciones para Multi-opción y Ranking */}
                {(poll.id_tipo_votacion === 2 || poll.id_tipo_votacion === 4) && (
                  <div className={styles.optionsSection}>
                    <label className={styles.label}>Opciones</label>
                    {q.opciones.map((opt, oi) => (
                      <div key={oi} className={styles.optionRow}>
                        <input
                          className={styles.input}
                          value={opt.texto_opcion}
                          onChange={e => {
                            const qs = [...questions]
                            qs[qi].opciones[oi].texto_opcion = e.target.value
                            setQuestions(qs)
                          }}
                          placeholder={poll.id_tipo_votacion === 2 ? `Opción #${oi + 1}` : `Elemento #${oi + 1}`}
                          required
                        />
                        <div className={styles.imageUploadGroup}>
                          <input
                            type="file" accept="image/*"
                            onChange={readImage(url => {
                              const qs = [...questions]
                              qs[qi].opciones[oi].url_imagen = url
                              setQuestions(qs)
                            })}
                            className={styles.fileInput}
                          />
                          {opt.url_imagen && (
                            <div className={styles.imagePreviewContainer}>
                              <img src={opt.url_imagen} alt="Preview" className={styles.previewImg} />
                              <button type="button" onClick={() => removeOptionImage(qi, oi)} className={styles.removeImageBtn}>×</button>
                            </div>
                          )}
                        </div>
                        <button type="button" onClick={() => removeOption(qi, oi)} className={styles.removeBtn}>×</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => addOption(qi)} className={styles.addBtn}>
                      + Agregar {poll.id_tipo_votacion === 2 ? 'opción' : 'elemento'}
                    </button>
                  </div>
                )}
              </fieldset>
            ))}
            <button type="button" onClick={addQuestion} className={styles.addQuestionBtn}>
              + Agregar {poll.id_tipo_votacion === 2 ? 'pregunta' : poll.id_tipo_votacion === 3 ? 'pregunta de puntuación' : 'pregunta de ranking'}
            </button>
          </>
        )}

        <button type="submit" className={styles.submitBtn} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}