'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import styles from './page.module.css'

interface OptionCount {
  name: string
  count: number
  url_imagen?: string
}

interface QuestionData {
  id_pregunta: number;
  texto_pregunta: string;
  url_imagen?: string; // Añadido para la imagen de la pregunta
  options: OptionCount[];
}

export default function RealtimeSelectionPage() {
  const [view, setView] = useState<'bar' | 'pie'>('bar')
  const [data, setData] = useState<QuestionData[]>([])
  const [pollTitle, setPollTitle] = useState<string | null>(null)
  const [pollType, setPollType] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let channel: any
    const nameMap = new Map<number, string>() // id_opcion -> texto_opcion
    const imgMap = new Map<number, string>()  // id_opcion -> url_imagen
    const questionNameMap = new Map<number, string>() // id_pregunta -> texto_pregunta
    const questionImgMap = new Map<number, string>() // id_pregunta -> url_imagen de la pregunta
    let questionIds: number[] = []

    ;(async () => {
      // 1) Encuesta activa + tipo + titulo
      const { data: poll, error: pollErr } = await supabase
        .from('encuestas')
        .select('id_encuesta,id_tipo_votacion,titulo')
        .eq('estado', 'activa')
        .single()
      if (pollErr || !poll) {
        setError('No hay encuesta activa en proceso.')
        setLoading(false)
        return
      }
      const { id_encuesta: pollId, id_tipo_votacion, titulo: poll_title } = poll
      setPollType(id_tipo_votacion)
      setPollTitle(poll_title)

      // 2) Preguntas
      const { data: qs, error: qe } = await supabase
        .from('preguntas_encuesta')
        .select('id_pregunta,texto_pregunta,url_imagen') // Seleccionar url_imagen de la pregunta
        .eq('id_encuesta', pollId)
        .order('id_pregunta', { ascending: true })
      if (qe) {
        setError('Error al cargar preguntas.')
        setLoading(false)
        return
      }
      questionIds = qs?.map(q => q.id_pregunta) || []
      qs?.forEach(q => {
        questionNameMap.set(q.id_pregunta, q.texto_pregunta)
        if (q.url_imagen) questionImgMap.set(q.id_pregunta, q.url_imagen) // Guardar imagen de la pregunta
      })

      // 3) Opciones
      const { data: opts, error: optsErr } = await supabase
        .from('opciones_pregunta')
        .select('id_opcion,texto_opcion,url_imagen,id_pregunta')
        .in('id_pregunta', questionIds)
      if (optsErr || !opts) {
        setError('Error al cargar opciones.')
        setLoading(false)
        return
      }
      opts.forEach(o => {
        nameMap.set(o.id_opcion, o.texto_opcion)
        if (o.url_imagen) imgMap.set(o.id_opcion, o.url_imagen)
      })

      // 4) Función de carga de datos según tipo de votación
      const loadData = async (): Promise<QuestionData[] | undefined> => {
        if (id_tipo_votacion === 1) { // Opción única (consolidada)
          const { data: votes, error: vErr } = await supabase
            .from('votos_respuestas')
            .select('id_opcion_seleccionada')
            .in('id_pregunta', questionIds)
          if (vErr) { setError(vErr.message); return }

          const counts: Record<number, number> = {}
          votes?.forEach(v => {
            const id = (v as any).id_opcion_seleccionada
            if (id) {
              counts[id] = (counts[id] || 0) + 1
            }
          })
          const consolidatedOptions: OptionCount[] = Array.from(nameMap.entries()).map(
            ([id, name]) => ({ name, count: counts[id] || 0, url_imagen: imgMap.get(id) })
          )
          return [{
            id_pregunta: 0,
            texto_pregunta: "Resultados Consolidados",
            url_imagen: undefined, // No hay imagen de pregunta para la vista consolidada
            options: consolidatedOptions
          }]
        } else if (id_tipo_votacion === 2) { // Opción múltiple (por pregunta)
          const { data: votes, error: vErr } = await supabase
            .from('votos_respuestas')
            .select('id_pregunta,id_opcion_seleccionada')
            .in('id_pregunta', questionIds)
          if (vErr) { setError(vErr.message); return }

          const questionOptionCounts: Record<number, Record<number, number>> = {}
          votes?.forEach(v => {
            const { id_pregunta, id_opcion_seleccionada } = v as any
            if (id_opcion_seleccionada) {
              if (!questionOptionCounts[id_pregunta]) {
                questionOptionCounts[id_pregunta] = {}
              }
              questionOptionCounts[id_pregunta][id_opcion_seleccionada] = (questionOptionCounts[id_pregunta][id_opcion_seleccionada] || 0) + 1
            }
          })

          const result: QuestionData[] = qs!.map(q => {
            const optionsData: OptionCount[] = opts!
              .filter(o => o.id_pregunta === q.id_pregunta)
              .map(o => ({
                name: o.texto_opcion,
                count: questionOptionCounts[q.id_pregunta]?.[o.id_opcion] || 0,
                url_imagen: imgMap.get(o.id_opcion)
              }))
            return {
              id_pregunta: q.id_pregunta,
              texto_pregunta: q.texto_pregunta,
              url_imagen: questionImgMap.get(q.id_pregunta), // Incluir imagen de la pregunta
              options: optionsData
            }
          })
          return result.filter(q => q.options.length > 0)
        } else if (id_tipo_votacion === 3) { // Puntuación
          const { data: votes, error: vErr } = await supabase
            .from('votos_respuestas')
            .select('id_pregunta,valor_puntuacion')
            .in('id_pregunta', questionIds)
          if (vErr) { setError(vErr.message); return }

          const questionScores: Record<number, { sum: number, count: number }> = {}
          votes?.forEach(v => {
            const { id_pregunta, valor_puntuacion } = v as any
            if (valor_puntuacion !== null) {
              if (!questionScores[id_pregunta]) {
                questionScores[id_pregunta] = { sum: 0, count: 0 }
              }
              questionScores[id_pregunta].sum += valor_puntuacion
              questionScores[id_pregunta].count += 1
            }
          })

          const result: QuestionData[] = questionIds.map(qId => {
            const totalScore = questionScores[qId]?.sum || 0
            const numVotes = questionScores[qId]?.count || 0
            const averageScore = numVotes > 0 ? totalScore / numVotes : 0

            return {
              id_pregunta: qId,
              texto_pregunta: questionNameMap.get(qId) || `Pregunta ${qId}`,
              url_imagen: questionImgMap.get(qId), // Incluir imagen de la pregunta
              options: [{
                name: "Puntuación Promedio",
                count: parseFloat(averageScore.toFixed(2)),
              }]
            }
          })
          return result
        } else if (id_tipo_votacion === 4) { // Ranking
          const { data: votes, error: vErr } = await supabase
            .from('votos_respuestas')
            .select('id_pregunta,id_opcion_seleccionada,orden_ranking')
            .in('id_pregunta', questionIds)
          if (vErr) { setError(vErr.message); return }

          const questionOptionRankings: Record<number, Record<number, { sum: number, count: number }>> = {}

          votes?.forEach(v => {
            const { id_pregunta, id_opcion_seleccionada, orden_ranking } = v as any
            if (id_opcion_seleccionada && orden_ranking !== null) {
              if (!questionOptionRankings[id_pregunta]) {
                questionOptionRankings[id_pregunta] = {}
              }
              if (!questionOptionRankings[id_pregunta][id_opcion_seleccionada]) {
                questionOptionRankings[id_pregunta][id_opcion_seleccionada] = { sum: 0, count: 0 }
              }
              questionOptionRankings[id_pregunta][id_opcion_seleccionada].sum += orden_ranking
              questionOptionRankings[id_pregunta][id_opcion_seleccionada].count += 1
            }
          })

          const result: QuestionData[] = qs!.map(q => {
            const optionsData: OptionCount[] = opts!
              .filter(o => o.id_pregunta === q.id_pregunta)
              .map(o => {
                const optionRanking = questionOptionRankings[q.id_pregunta]?.[o.id_opcion]
                const averageRank = optionRanking?.count ? optionRanking.sum / optionRanking.count : 0
                return {
                  name: o.texto_opcion,
                  count: parseFloat(averageRank.toFixed(2)),
                  url_imagen: imgMap.get(o.id_opcion)
                }
              })
              .sort((a, b) => a.count - b.count)

            return {
              id_pregunta: q.id_pregunta,
              texto_pregunta: q.texto_pregunta,
              url_imagen: questionImgMap.get(q.id_pregunta), // Incluir imagen de la pregunta
              options: optionsData
            }
          })
          return result.filter(q => q.options.length > 0)
        }
        return []
      }

      // 5) Carga inicial
      const initial = await loadData()
      if (initial) setData(initial)
      setLoading(false)

      // 6) Suscripción
      channel = supabase
        .channel(`realtime-${pollId}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'votos_respuestas',
          filter: `id_pregunta=in.(${questionIds.join(',')})`
        }, async ({ new: resp }: any) => {
          const updated = await loadData()
          if (updated) setData(updated)
        })
        .subscribe()
    })()

    return () => { if (channel) supabase.removeChannel(channel) }
  }, [])

  if (loading) return <p className={styles.info}>🔄 Cargando resultados en tiempo real…</p>
  if (error) return <p className={styles.error}>{error}</p>

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28FDF', '#FF6B6B', '#5A9BD5', '#FFD700', '#8A2BE2', '#DC143C', '#228B22', '#FFDAB9'];

  const renderCharts = () => {
    return data.map(qData => (
      <div key={qData.id_pregunta} className={styles.chartBlock}>
        {/* Muestra el título de la pregunta solo si hay más de una pregunta o si no es el tipo consolidado */}
        {(data.length > 1 || pollType !== 1) && (
          <h2 className={styles.questionTitle}>{qData.texto_pregunta}</h2>
        )}

        {/* Imagen de la pregunta */}
        {qData.url_imagen && (
          <img src={qData.url_imagen} alt={qData.texto_pregunta} className={styles.questionImg} />
        )}

        {pollType === 4 && (
          <p className={styles.rankingInfo}>Menor valor = mejor ranking</p>
        )}

        <ResponsiveContainer width="100%" height={
          pollType === 3 ? 200 :
          qData.options.length > 5 ? 400 :
          300
        }>
          {(pollType === 1 || pollType === 2) && view === 'pie' ? (
            <PieChart>
              <Pie
                data={qData.options}
                dataKey="count"
                nameKey="name"
                cx="50%" cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
              >
                {qData.options.map((_, i) => (
                  <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `${value} votos`} />
              <Legend />
            </PieChart>
          ) : (
            <BarChart data={qData.options}>
              <XAxis
                dataKey="name"
                interval={0}
                angle={qData.options.length > 3 ? -30 : 0}
                textAnchor={qData.options.length > 3 ? "end" : "middle"}
                height={qData.options.length > 3 ? 60 : 30}
              />
              <YAxis
                allowDecimals={pollType === 3 || pollType === 4}
                label={{
                  value: pollType === 1 || pollType === 2 ? 'Número de Votos' :
                         pollType === 3 ? 'Puntuación Promedio' :
                         'Promedio de Ranking',
                  angle: -90,
                  position: 'insideLeft'
                }}
                domain={pollType === 3 ? [0, 10] : ['auto', 'auto']}
              />
              <Tooltip formatter={(value: number) =>
                pollType === 1 || pollType === 2 ? `${value} votos` :
                `${value.toFixed(2)} (Promedio)`
              } />
              <Bar dataKey="count" fill={
                pollType === 1 ? '#8884d8' :
                pollType === 2 ? '#4CAF50' :
                pollType === 3 ? '#20B2AA' :
                '#FF5733'
              } />
            </BarChart>
          )}
        </ResponsiveContainer>

        <div className={styles.optionList}>
          {qData.options.map((opt, i) => (
            <div key={i} className={styles.optionItem}>
              {opt.url_imagen && (
                <img
                  src={opt.url_imagen}
                  alt={opt.name}
                  className={styles.optionImg}
                />
              )}
              <span className={styles.optionText}>
                {opt.name}:{' '}
                {pollType === 1 || pollType === 2
                  ? `${opt.count.toString()} votos`
                  : `${opt.count.toFixed(2)} (Prom.)`
                }
              </span>
            </div>
          ))}
        </div>
      </div>
    ))
  }

  return (
    <div className={styles.container}>
      {pollTitle && <h1 className={styles.mainTitle}>{pollTitle}</h1>}
      <h2 className={styles.subTitle}>Resultados en tiempo real</h2>

      {(pollType === 1 || pollType === 2) && (
        <div className={styles.toggleGroup}>
          <button
            className={view === 'bar' ? styles.toggleActive : styles.toggleButton}
            onClick={() => setView('bar')}
          >Barras</button>
          <button
            className={view === 'pie' ? styles.toggleActive : styles.toggleButton}
            onClick={() => setView('pie')}
          >Pastel</button>
        </div>
      )}

      {renderCharts()}
    </div>
  )
}