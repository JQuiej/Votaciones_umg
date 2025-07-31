'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { supabase } from '../../../lib/supabaseClient'
import styles from './page.module.css'

interface Poll {
  id_encuesta:      number
  titulo:           string
  descripcion:      string | null
  estado:           string
  id_tipo_votacion: number
}

interface Opcion {
  id_opcion:    number
  texto_opcion: string
  url_imagen:   string | null
}

interface Pregunta {
  id_pregunta:    number
  texto_pregunta: string
  url_imagen:     string | null
  opciones:       Opcion[]
}

export default function VotePage() {
  const { codigo_acceso } = useParams<{ codigo_acceso: string }>()
  const router = useRouter()

  const [poll, setPoll] = useState<Poll | null>(null)
  const [preguntas, setPreguntas] = useState<Pregunta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false); // Nuevo estado para controlar el envío

  // respuestas
  const [singleResp, setSingleResp] = useState<Record<number, number>>({})
  const [multiResp, setMultiResp]   = useState<Record<number, Set<number>>>({})
  const [scoreResp, setScoreResp]   = useState<Record<number, number>>({})
  const [rankResp, setRankResp]     = useState<Record<number, Record<number, number>>>({})

  // helpers para actualizar estado
  const handleSingleChange = (qId: number, oId: number) =>
    setSingleResp(prev => ({ ...prev, [qId]: oId }))
  const handleMultiChange = (qId: number, oId: number) => {
    setMultiResp(prev => {
      const newSet = new Set(prev[qId])
      newSet.has(oId) ? newSet.delete(oId) : newSet.add(oId)
      return { ...prev, [qId]: newSet }
    })
  }
  const handleScoreChange = (qId: number, val: number) =>
    setScoreResp(prev => ({ ...prev, [qId]: val }))
  const handleRankChange = (qId: number, oId: number, val: number) =>
    setRankResp(prev => ({
      ...prev,
      [qId]: { ...prev[qId], [oId]: val }
    }))

  // 1) obtener fingerprint
  useEffect(() => {
    FingerprintJS.load()
      .then(fp => fp.get())
      .then(result => setFingerprint(result.visitorId))
      .catch(() => setFingerprint(null))
  }, [])

  // 2) cargar encuesta, preguntas, options y verificar voto previo
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null); // Limpiar errores previos

      // 2.1) Encuesta
      const { data: p, error: pe } = await supabase
        .from('encuestas')
        .select('id_encuesta,titulo,descripcion,estado,id_tipo_votacion')
        .eq('codigo_acceso', codigo_acceso!)
        .single()
      if (pe || !p) {
        setError('Enlace de encuesta inválido o no encontrado.')
        setLoading(false)
        return
      }

      // Verificar el estado de la encuesta
      if (p.estado !== 'activa') {
        setPoll(p); // Cargar el poll para mostrar su título
        setError(`Esta encuesta no está disponible para votar en este momento. Estado: ${p.estado.toUpperCase()}`);
        setLoading(false);
        return;
      }

      setPoll(p)

      // 2.2) Preguntas y opciones
      const { data: qs, error: qe } = await supabase
        .from('preguntas_encuesta')
        .select('id_pregunta,texto_pregunta,url_imagen')
        .eq('id_encuesta', p.id_encuesta)
        .order('id_pregunta', { ascending: true })
      if (qe) {
        setError(qe.message)
        setLoading(false)
        return
      }
      const cargadas: Pregunta[] = []
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
        cargadas.push({ ...q, opciones: opts || [] })
      }
      setPreguntas(cargadas)

      // 2.3) Inicializar respuestas
      const sInit: Record<number, number>      = {}
      const mInit: Record<number, Set<number>> = {}
      const scInit: Record<number, number>     = {}
      const rInit: Record<number, Record<number,number>> = {}
      for (const q of cargadas) {
        sInit[q.id_pregunta] = 0
        mInit[q.id_pregunta] = new Set()
        scInit[q.id_pregunta] = 0
        rInit[q.id_pregunta] = q.opciones.reduce((a,o)=>({ ...a, [o.id_opcion]: 0 }), {})
      }
      setSingleResp(sInit)
      setMultiResp(mInit)
      setScoreResp(scInit)
      setRankResp(rInit)

      // 2.4) Verificar voto previo
      if (fingerprint) {
        const { data: exist } = await supabase
          .from('votos')
          .select('id_voto')
          .eq('id_encuesta', p.id_encuesta)
          .eq('huella_dispositivo', fingerprint)
          .single()
        if (exist) setHasVoted(true)
      }

      setLoading(false)
    })()
  }, [codigo_acceso, fingerprint])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!poll || !fingerprint || isSubmitting) return

    setIsSubmitting(true); // Bloquear el botón de envío
    try {
      // 1) inserto el voto master
      const { data: voteRec, error: voteErr } = await supabase
        .from('votos')
        .insert({ id_encuesta: poll.id_encuesta, huella_dispositivo: fingerprint })
        .select('id_voto')
        .single()
      if (voteErr || !voteRec) {
        if (voteErr.code === '23505') { // Código de error para unique_violation (ya votó)
          setHasVoted(true);
          throw new Error('Ya has votado en esta encuesta.');
        }
        throw voteErr;
      }
      const idVoto = voteRec.id_voto

      // 2) construyo el array de respuestas
      const respuestas: any[] = []
      for (const q of preguntas) {
        const qid = q.id_pregunta
        if (poll.id_tipo_votacion === 1) {
          const sel = singleResp[qid]
          if (!sel) throw new Error(`Selecciona una opción en "${q.texto_pregunta}"`)
          respuestas.push({ id_voto: idVoto, id_pregunta: qid, id_opcion_seleccionada: sel })
        }
        else if (poll.id_tipo_votacion === 2) {
          const setSel = multiResp[qid]
          if (setSel.size === 0) throw new Error(`Selecciona al menos una en "${q.texto_pregunta}"`)
          for (const oid of setSel) {
            respuestas.push({ id_voto: idVoto, id_pregunta: qid, id_opcion_seleccionada: oid })
          }
        }
        else if (poll.id_tipo_votacion === 3) {
          const val = scoreResp[qid]
          // Asumiendo que maxScore se cargaría con la pregunta, si no, usar un valor por defecto (ej. 10)
          // const maxScore = q.maxScore || 10; // Si maxScore viene en la interfaz Pregunta
          if (val <= 0 || val > 10) throw new Error(`Califica "${q.texto_pregunta}" con un valor entre 1 y 10.`)
          respuestas.push({ id_voto: idVoto, id_pregunta: qid, valor_puntuacion: val })
        }
        else if (poll.id_tipo_votacion === 4) {
          const ranks = rankResp[qid]
          const assignedRanks = Object.values(ranks).filter(r => r > 0);
          if (new Set(assignedRanks).size !== assignedRanks.length) {
            throw new Error(`Los rankings en "${q.texto_pregunta}" deben ser únicos y no pueden repetirse.`);
          }
          if (assignedRanks.length !== q.opciones.length) {
            throw new Error(`Asigna un ranking a todas las opciones en "${q.texto_pregunta}".`);
          }

          for (const [oid, orden] of Object.entries(ranks)) {
            if (orden > 0) {
              respuestas.push({
                id_voto: idVoto,
                id_pregunta: qid,
                id_opcion_seleccionada: Number(oid),
                orden_ranking: orden
              })
            }
          }
        }
      }

      // 3) inserto todas las respuestas
      const { error: respErr } = await supabase
        .from('votos_respuestas')
        .insert(respuestas)
      if (respErr) throw respErr

      setHasVoted(true)
      alert('¡Gracias por votar!')
    } catch (err: any) {
      setError(err.message); // Mostrar el error en la UI
      // alert(err.message) // Mantener alerta para errores críticos o de validación
    } finally {
      setIsSubmitting(false); // Liberar el botón de envío
    }
  }

  if (loading) return <p className={styles.info}>🔄 Cargando…</p>
  if (error) {
    // Si hay un error, pero el poll se cargó (ej. por estado no activo), mostramos el título
    return (
      <div className={styles.container}>
        {poll && <h1 className={styles.title}>{poll.titulo}</h1>}
        <p className={styles.error}>{error}</p>
        {/* Opcional: botón para regresar si hay un error no fatal */}
        <button onClick={() => router.back()} className={styles.backButton}>
          ← Regresar
        </button>
      </div>
    );
  }
  if (!poll) return null // No renderizar nada si el poll no se ha cargado y no hay error.

  // si ya votó
  if (hasVoted) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>{poll.titulo}</h1>
        <p className={styles.info}>Ya has votado esta encuesta.</p>
        <button onClick={() => router.back()} className={styles.backButton}>
          ← Regresar
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={styles.container}>
      <h1 className={styles.title}>{poll.titulo}</h1>
      {poll.descripcion && <p className={styles.description}>{poll.descripcion}</p>}

      {preguntas.map(q => (
        <fieldset key={q.id_pregunta} className={styles.questionBlock}>
          <legend>{q.texto_pregunta}</legend>
          {q.url_imagen && (
            <img
              src={q.url_imagen}
              alt={q.texto_pregunta}
              className={styles.questionImg}
            />
          )}

          {poll.id_tipo_votacion === 1 && ( // Opción única
            <div className={styles.optionList}>
              {q.opciones.map(o => (
                <label key={o.id_opcion} className={styles.optionItem}>
                  <input
                    type="radio"
                    name={`q_${q.id_pregunta}`}
                    checked={singleResp[q.id_pregunta] === o.id_opcion}
                    onChange={() => handleSingleChange(q.id_pregunta, o.id_opcion)}
                    className={styles.radioInput}
                  />
                  {o.url_imagen && <img src={o.url_imagen} alt={o.texto_opcion} className={styles.optionImg} />}
                  <span className={styles.optionLabel}>{o.texto_opcion}</span>
                </label>
              ))}
            </div>
          )}

          {poll.id_tipo_votacion === 2 && ( // Opción múltiple
            <div className={styles.optionList}>
              {q.opciones.map(o => (
                <label key={o.id_opcion} className={styles.optionItem}>
                  <input
                    type="checkbox"
                    checked={multiResp[q.id_pregunta]?.has(o.id_opcion)}
                    onChange={() => handleMultiChange(q.id_pregunta, o.id_opcion)}
                    className={styles.checkboxInput}
                  />
                  {o.url_imagen && <img src={o.url_imagen} alt={o.texto_opcion} className={styles.optionImg} />}
                  <span className={styles.optionLabel}>{o.texto_opcion}</span>
                </label>
              ))}
            </div>
          )}

          {poll.id_tipo_votacion === 3 && ( // Puntuación
            <div className={styles.scoreSection}>
              <label className={styles.scoreLabel}>
                Tu puntuación:
                <input
                  type="number"
                  min={1}
                  max={10} // Asumiendo que la puntuación máxima es 10. Si es dinámica, cárgala desde la DB.
                  value={scoreResp[q.id_pregunta] || ''}
                  onChange={e =>
                    handleScoreChange(
                      q.id_pregunta,
                      e.target.value === '' ? 0 : parseInt(e.target.value, 10)
                    )
                  }
                  className={styles.inputNumber}
                />
              </label>
              {q.opciones.length > 0 && ( // Si hay opciones para puntuar (ej. las etiquetas de lo que se puntúa)
                <div className={styles.scoreOptionsList}>
                    {q.opciones.map(o => (
                        <div key={o.id_opcion} className={styles.scoreOptionItem}>
                            {o.url_imagen && (
                                <img src={o.url_imagen} alt={o.texto_opcion} className={styles.optionImg} />
                            )}
                            <span className={styles.scoreOptionLabel}>{o.texto_opcion}</span>
                        </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {poll.id_tipo_votacion === 4 && ( // Ranking
            <div className={styles.rankingSection}>
              <p className={styles.rankingInstructions}>Asigna un número del 1 al {q.opciones.length} (1 para el primero, etc.)</p>
              {q.opciones.map(o => (
                <div key={o.id_opcion} className={styles.rankingItem}>
                  {o.url_imagen && <img src={o.url_imagen} alt={o.texto_opcion} className={styles.optionImg} />}
                  <span className={styles.rankingOptionLabel}>{o.texto_opcion}</span>
                  <input
                    type="number"
                    min={1}
                    max={q.opciones.length}
                    value={rankResp[q.id_pregunta]?.[o.id_opcion] || ''}
                    onChange={e =>
                      handleRankChange(
                        q.id_pregunta,
                        o.id_opcion,
                        e.target.value === '' ? 0 : parseInt(e.target.value, 10)
                      )
                    }
                    className={styles.inputNumber}
                  />
                </div>
              ))}
            </div>
          )}
        </fieldset>
      ))}

      <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
        {isSubmitting ? 'Enviando voto...' : 'Votar'}
      </button>
    </form>
  )
}