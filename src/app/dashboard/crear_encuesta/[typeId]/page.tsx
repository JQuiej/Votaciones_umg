// src/app/dashboard/crear_encuesta/[typeId]/page.tsx
'use client'

import React, { useState, useEffect, ChangeEvent } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabaseClient'
import { Eye } from 'lucide-react'
import styles from './page.module.css'

interface Candidate {
  name: string
  imageBase64: string
}

interface MultipleQuestion {
  question: string
  options: string[]
  imageBase64: string
}

interface ScoringQuestion {
  question: string
  maxScore: number
  imageBase64: string
}

interface RankingQuestion {
  question: string
  choices: { text: string; score: number }[]
  imageBase64: string
}

export default function CreatePollFormPage() {
  const { typeId } = useParams<{ typeId: string }>()
  const router = useRouter()

  const [typeName, setTypeName]       = useState('')
  const [titulo, setTitulo]           = useState('')
  const [descripcion, setDescripcion] = useState('')

  const [candidates, setCandidates] = useState<Candidate[]>([{ name: '', imageBase64: '' }])
  const [multiQuestions, setMultiQuestions] = useState<MultipleQuestion[]>([{ question: '', options: [''], imageBase64: '' }])
  const [scoreQuestions, setScoreQuestions] = useState<ScoringQuestion[]>([{ question: '', maxScore: 10, imageBase64: '' }])
  const [rankQuestions, setRankQuestions] = useState<RankingQuestion[]>([{ question: '', choices: [{ text: '', score: 0 }], imageBase64: '' }])
  const [preview, setPreview] = useState(false)

  const isCandidates = Number(typeId) === 1
  const isMultiple   = typeName === 'Opción múltiple'
  const isScoring    = typeName === 'Puntuación'
  const isRanking    = typeName === 'Ranking'

  useEffect(() => {
    if (!typeId) return
    supabase
      .from('tipos_votacion')
      .select('nombre')
      .eq('id_tipo_votacion', Number(typeId))
      .single()
      .then(({ data }) => data?.nombre && setTypeName(data.nombre))
  }, [typeId])

  const readImage = (cb: (dataUrl: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => cb(reader.result as string)
    reader.readAsDataURL(file)
  }

  const addCandidate = () =>
    setCandidates(prev => [...prev, { name: '', imageBase64: '' }])
  const removeCandidate = (i: number) => {
    const arr = [...candidates]
    arr.splice(i, 1)
    setCandidates(arr)
  }

  const generateAccessCode = (len = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    return Array.from({ length: len }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user.id) return router.replace('/auth/login')

    const code = generateAccessCode(8)
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      (typeof window !== 'undefined' ? window.location.origin : '')
    const url = `${baseUrl}/vote/${code}`

    // 1) Crear encuesta
    const { data: enc, error: encErr } = await supabase
      .from('encuestas')
      .insert({
        titulo,
        descripcion,
        id_tipo_votacion: Number(typeId),
        id_usuario_creador: session.user.id,
        codigo_acceso: code,
        url_votacion: url,
      })
      .select('id_encuesta')
      .single()
    if (encErr || !enc) {
      alert(encErr?.message)
      return
    }
    const pollId = enc.id_encuesta

    try {
      // 2) Insertar preguntas y opciones
      if (isCandidates) {
        // Una sola pregunta "Opciones"
        const { data: pq, error: pqErr } = await supabase
          .from('preguntas_encuesta')
          .insert({
            id_encuesta:      pollId,
            id_tipo_votacion: Number(typeId),
            texto_pregunta:   'Opciones',
            url_imagen:       null,
          })
          .select('id_pregunta')
          .single()
        if (pqErr || !pq) throw pqErr

        await supabase
          .from('opciones_pregunta')
          .insert(
            candidates
              .filter(c => c.name.trim())
              .map(c => ({
                id_pregunta:   pq.id_pregunta,
                texto_opcion:  c.name.trim(),
                url_imagen:    c.imageBase64 || null,
              }))
          )

      } else if (isMultiple) {
        for (const q of multiQuestions) {
          const { data: pq, error: pqErr } = await supabase
            .from('preguntas_encuesta')
            .insert({
              id_encuesta:      pollId,
              id_tipo_votacion: Number(typeId),
              texto_pregunta:   q.question.trim(),
              url_imagen:       q.imageBase64 || null,
            })
            .select('id_pregunta')
            .single()
          if (pqErr || !pq) throw pqErr

          await supabase
            .from('opciones_pregunta')
            .insert(
              q.options
                .filter(o => o.trim())
                .map(opt => ({
                  id_pregunta:  pq.id_pregunta,
                  texto_opcion: opt.trim(),
                  url_imagen:   q.imageBase64 || null,
                }))
            )
        }

      } else if (isScoring) {
        for (const q of scoreQuestions) {
          const { data: pq, error: pqErr } = await supabase
            .from('preguntas_encuesta')
            .insert({
              id_encuesta:      pollId,
              id_tipo_votacion: Number(typeId),
              texto_pregunta:   q.question.trim(),
              url_imagen:       q.imageBase64 || null,
            })
            .select('id_pregunta')
            .single()
          if (pqErr || !pq) throw pqErr

          await supabase
            .from('opciones_pregunta')
            .insert(
              Array.from({ length: q.maxScore }, (_, i) => ({
                id_pregunta:  pq.id_pregunta,
                texto_opcion: String(i + 1),
                url_imagen:   q.imageBase64 || null,
              }))
            )
        }

      } else if (isRanking) {
        for (const q of rankQuestions) {
          const { data: pq, error: pqErr } = await supabase
            .from('preguntas_encuesta')
            .insert({
              id_encuesta:      pollId,
              id_tipo_votacion: Number(typeId),
              texto_pregunta:   q.question.trim(),
              url_imagen:       q.imageBase64 || null,
            })
            .select('id_pregunta')
            .single()
          if (pqErr || !pq) throw pqErr

          await supabase
            .from('opciones_pregunta')
            .insert(
              q.choices
                .filter(c => c.text.trim())
                .map(c => ({
                  id_pregunta:  pq.id_pregunta,
                  texto_opcion: c.text.trim(),
                  url_imagen:   null,
                }))
            )
        }
      }

      router.push(`/dashboard/polls/${pollId}`)
    } catch (err: any) {
      console.error(err)
      alert('Error al guardar preguntas u opciones: ' + err.message)
    }
  }

  if (preview) {
    return (
      <div className={styles.container}>
        <button onClick={() => setPreview(false)} className={styles.button}>
          ← Volver edición
        </button>
        <h2 className={styles.heading}>{titulo}</h2>
        {descripcion && <p className={styles.description}>{descripcion}</p>}

        <form className={styles.form}>
          {isCandidates && (
            <fieldset className={styles.fieldset}>
              <legend>Opciones</legend>
              {candidates.map((c,i) => (
                <label key={i} className={styles.optionItem}>
                  <input type="radio" name="single" disabled />
                  {c.imageBase64 && <img src={c.imageBase64} className={styles.optionImg} />}
                  <span>{c.name}</span>
                </label>
              ))}
            </fieldset>
          )}

          {isMultiple && multiQuestions.map((q, qi) => (
            <fieldset key={qi} className={styles.fieldset}>
              <legend>{q.question}</legend>
              {q.imageBase64 && <img src={q.imageBase64} className={styles.previewImg} />}
              {q.options.map((opt, oi) => (
                <label key={oi} className={styles.optionItem}>
                  <input type="checkbox" disabled />
                  <span>{opt}</span>
                </label>
              ))}
            </fieldset>
          ))}

          {isScoring && scoreQuestions.map((q, qi) => (
            <fieldset key={qi} className={styles.fieldset}>
              <legend>{q.question}</legend>
              {q.imageBase64 && <img src={q.imageBase64} className={styles.previewImg} />}
              <label className={styles.optionItem}>
                Calificación:
                <input type="number" min={1} max={q.maxScore} disabled className={styles.inputNumber}/>
              </label>
            </fieldset>
          ))}

          {isRanking && rankQuestions.map((q, qi) => (
            <fieldset key={qi} className={styles.fieldset}>
              <legend>{q.question}</legend>
              {q.imageBase64 && <img src={q.imageBase64} className={styles.previewImg} />}
              {q.choices.map((c, ci) => (
                <label key={ci} className={styles.optionItem}>
                  <span>{c.text}</span>
                  <input type="number" min={0} max={10} disabled className={styles.inputNumber}/>
                </label>
              ))}
            </fieldset>
          ))}

          <button type="button" disabled className={styles.submitBtn}>
            Enviar voto (simulado)
          </button>
        </form>
      </div>
    )
  }
  

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Crear encuesta: {typeName}</h1>
      <form className={styles.form} onSubmit={handleSubmit}>
        {/* Campos generales */}
        <div className={styles.field}>
          <label>Título</label>
          <input
            className={styles.input}
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            required
          />
        </div>
        <div className={styles.field}>
          <label>Descripción</label>
          <textarea
            className={styles.textarea}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
          />
        </div>

        {/* Agregar según tipo */}
       {/* Opciones */}
        {isCandidates && candidates.map((c, i) => (
          <div key={i} className={styles.card}>
            <input
              className={styles.input}
              placeholder="Nombre"
              value={c.name}
              onChange={e => {
                const arr = [...candidates]; arr[i].name = e.target.value; setCandidates(arr)
              }}
              required
            />
            <input
              className={styles.input}
              type="file" accept="image/*"
              onChange={readImage(dataUrl => {
                const arr = [...candidates]; arr[i].imageBase64 = dataUrl; setCandidates(arr)
              })}
            />
            {candidates.length > 1 && (
              <button type="button" onClick={() => removeCandidate(i)} className={styles.removeBtn}>
                Eliminar
              </button>
            )}
          </div>
        ))}
        {isCandidates && (
          <button type="button" onClick={addCandidate} className={styles.button}>
            + Agregar Opcion
          </button>
        )}

        {/* Opción múltiple */}
        {isMultiple && multiQuestions.map((q, i) => (
          <div key={i} className={styles.card}>
            <input
              className={styles.input}
              placeholder="Pregunta"
              value={q.question}
              onChange={e => {
                const arr = [...multiQuestions]; arr[i].question = e.target.value; setMultiQuestions(arr)
              }}
              required
            />
            <input
              className={styles.input}
              type="file" accept="image/*"
              onChange={readImage(dataUrl => {
                const arr = [...multiQuestions]; arr[i].imageBase64 = dataUrl; setMultiQuestions(arr)
              })}
            />
            {q.options.map((opt, j) => (
              <div key={j} className={styles.optionRow}>
                <input
                  className={styles.input}
                  placeholder={`Opción #${j + 1}`}
                  value={opt}
                  onChange={e => {
                    const arr = [...multiQuestions]; arr[i].options[j] = e.target.value; setMultiQuestions(arr)
                  }}
                  required
                />
                {q.options.length > 1 && (
                  <button type="button" onClick={() => {
                    const arr = [...multiQuestions]; arr[i].options.splice(j, 1); setMultiQuestions(arr)
                  }} className={styles.removeBtn}>
                    ×
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => {
              const arr = [...multiQuestions]; arr[i].options.push(''); setMultiQuestions(arr)
            }} className={styles.button}>
              + Agregar opción
            </button>
          </div>
        ))}
        {isMultiple && (
          <button type="button" onClick={() => {
            setMultiQuestions(prev => [...prev, { question: '', options: [''], imageBase64: '' }])
          }} className={styles.button}>
            + Agregar pregunta
          </button>
        )}

        {/* Puntuación */}
        {isScoring && scoreQuestions.map((q, i) => (
          <div key={i} className={styles.card}>
            <input
              className={styles.input}
              placeholder="Pregunta"
              value={q.question}
              onChange={e => {
                const arr = [...scoreQuestions]; arr[i].question = e.target.value; setScoreQuestions(arr)
              }}
              required
            />
            <input
              className={styles.input}
              type="number"
              min={1}
              max={100}
              // Si maxScore es 0, mostramos cadena vacía para que el usuario pueda borrar el contenido
              value={q.maxScore === 0 ? '' : q.maxScore}
              onChange={e => {
                const valStr = e.target.value
                const arr = [...scoreQuestions]
                // Si borra todo (cadena vacía), guardamos 0; si no, convertimos a número
                arr[i].maxScore = valStr === '' ? 0 : parseInt(valStr, 10)
                setScoreQuestions(arr)
              }}
            />

            <input
              className={styles.input}
              type="file" accept="image/*"
              onChange={readImage(dataUrl => {
                const arr = [...scoreQuestions]; arr[i].imageBase64 = dataUrl; setScoreQuestions(arr)
              })}
            />
          </div>
        ))}
        {isScoring && (
          <button type="button" onClick={() => {
            setScoreQuestions(prev => [...prev, { question: '', maxScore: 10, imageBase64: '' }])
          }} className={styles.button}>
            + Agregar pregunta de puntuación
          </button>
        )}

        {/* Ranking */}
        {isRanking && rankQuestions.map((q, i) => (
          <div key={i} className={styles.card}>
            <input
              className={styles.input}
              placeholder="Pregunta"
              value={q.question}
              onChange={e => {
                const arr = [...rankQuestions]; arr[i].question = e.target.value; setRankQuestions(arr)
              }}
              required
            />
            <input
              className={styles.input}
              type="file" accept="image/*"
              onChange={readImage(dataUrl => {
                const arr = [...rankQuestions]; arr[i].imageBase64 = dataUrl; setRankQuestions(arr)
              })}
            />
            {q.choices.map((c, j) => (
              <div key={j} className={styles.optionRow}>
                <input
                  className={styles.input}
                  placeholder="Opción"
                  value={c.text}
                  onChange={e => {
                    const arr = [...rankQuestions]; arr[i].choices[j].text = e.target.value; setRankQuestions(arr)
                  }}
                  required
                />
                <input
                  className={styles.input}
                  type="number" min={0} max={10}
                  value={c.score}
                  onChange={e => {
                    const arr = [...rankQuestions]; arr[i].choices[j].score = +e.target.value; setRankQuestions(arr)
                  }}
                />
                {q.choices.length > 1 && (
                  <button type="button" onClick={() => {
                    const arr = [...rankQuestions]; arr[i].choices.splice(j, 1); setRankQuestions(arr)
                  }} className={styles.removeBtn}>
                    ×
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => {
              const arr = [...rankQuestions]; arr[i].choices.push({ text: '', score: 0 }); setRankQuestions(arr)
            }} className={styles.button}>
              + Agregar opción
            </button>
          </div>
        ))}
        {isRanking && (
          <button type="button" onClick={() => {
            setRankQuestions(prev => [...prev, { question: '', choices: [{ text: '', score: 0 }], imageBase64: '' }])
          }} className={styles.button}>
            + Agregar pregunta de ranking
          </button>
        )}

        <div className={styles.actions}>
          <button type="button" onClick={() => setPreview(true)} className={styles.previewBtn}>
            <Eye size={16} /> Previsualizar
          </button>
          <button type="submit" className={styles.submitBtn}>
            Crear encuesta
          </button>
        </div>
      </form>
    </div>
  )
}
