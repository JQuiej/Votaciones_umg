// src/app/vote/[codigo_acceso]/page.tsx
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

  // respuestas
  const [singleResp, setSingleResp] = useState<Record<number, number>>({})
  const [multiResp, setMultiResp]   = useState<Record<number, Set<number>>>({})
  const [scoreResp, setScoreResp]   = useState<Record<number, number>>({})
  const [rankResp, setRankResp]     = useState<Record<number, Record<number, number>>>({})

  // helpers para actualizar estado
  const handleSingleChange = (qId: number, oId: number) =>
    setSingleResp(prev => ({ ...prev, [qId]: oId }))
  const handleMultiChange = (qId: number, oId: number) => {
    const next = new Set(multiResp[qId])
    next.has(oId) ? next.delete(oId) : next.add(oId)
    setMultiResp(prev => ({ ...prev, [qId]: next }))
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

      // 2.1) Encuesta
      const { data: p, error: pe } = await supabase
        .from('encuestas')
        .select('id_encuesta,titulo,descripcion,estado,id_tipo_votacion')
        .eq('codigo_acceso', codigo_acceso!)
        .single()
      if (pe || !p) {
        setError('Enlace inválido')
        setLoading(false)
        return
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
      const sInit: Record<number, number>       = {}
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
    if (!poll || !fingerprint) return

    try {
      // 1) inserto el voto master
      const { data: voteRec, error: voteErr } = await supabase
        .from('votos')
        .insert({ id_encuesta: poll.id_encuesta, huella_dispositivo: fingerprint })
        .select('id_voto')
        .single()
      if (voteErr || !voteRec) throw voteErr
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
          if (val <= 0) throw new Error(`Califica "${q.texto_pregunta}"`)
          respuestas.push({ id_voto: idVoto, id_pregunta: qid, valor_puntuacion: val })
        }
        else if (poll.id_tipo_votacion === 4) {
          const ranks = rankResp[qid]
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
      alert(err.message)
    }
  }

  if (loading) return <p className={styles.info}>🔄 Cargando…</p>
  if (error)   return <p className={styles.error}>{error}</p>
  if (!poll)  return null

  // si ya votó
  if (hasVoted) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>{poll.titulo}</h1>
        <p className={styles.info}>Ya has votado esta encuesta.</p>
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

          {poll.id_tipo_votacion === 1 && q.opciones.map(o => (
            <label key={o.id_opcion} className={styles.optionItem}>
              <input
                type="radio"
                name={`q_${q.id_pregunta}`}
                checked={singleResp[q.id_pregunta] === o.id_opcion}
                onChange={() => handleSingleChange(q.id_pregunta, o.id_opcion)}
              />
              <span className={styles.optionLabel}>{o.texto_opcion}</span>
            </label>
          ))}

          {poll.id_tipo_votacion === 2 && q.opciones.map(o => (
            <label key={o.id_opcion} className={styles.optionItem}>
              <input
                type="checkbox"
                checked={multiResp[q.id_pregunta].has(o.id_opcion)}
                onChange={() => handleMultiChange(q.id_pregunta, o.id_opcion)}
              />
              <span className={styles.optionLabel}>{o.texto_opcion}</span>
            </label>
          ))}

          {poll.id_tipo_votacion === 3 && (
            <div className={styles.optionItem}>
              <label className={styles.optionLabel}>
                Tu puntuación:
                <input
                  type="number"
                  min={1}
                  max={10}
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
            </div>
          )}

          {poll.id_tipo_votacion === 4 && q.opciones.map(o => (
            <label key={o.id_opcion} className={styles.optionItem}>
              <span className={styles.optionLabel}>{o.texto_opcion}</span>
              <input
                type="number"
                min={1}
                max={q.opciones.length}
                value={rankResp[q.id_pregunta][o.id_opcion] || ''}
                onChange={e =>
                  handleRankChange(
                    q.id_pregunta,
                    o.id_opcion,
                    e.target.value === '' ? 0 : parseInt(e.target.value, 10)
                  )
                }
                className={styles.inputNumber}
              />
            </label>
          ))}
        </fieldset>
      ))}

      <button type="submit" className={styles.submitBtn}>
        Votar
      </button>
    </form>
  )
}
