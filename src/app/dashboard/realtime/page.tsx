'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import styles from './page.module.css'

interface OptionCount {
  name: string
  count: number
  url_imagen?: string
}

export default function RealtimeSelectionPage() {
  const [view, setView]       = useState<'bar'|'pie'>('bar')
  const [data, setData]       = useState<OptionCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    let channel: any
    const nameMap = new Map<number,string>()
    const imgMap  = new Map<number,string>()

    ;(async () => {
      setLoading(true)
      // 1) obtener encuesta activa
      const { data: poll, error: pollErr } = await supabase
        .from('encuestas')
        .select('id_encuesta')
        .eq('estado','activa')
        .single()
      if (pollErr || !poll) {
        setError('No hay ninguna encuesta en proceso.')
        setLoading(false)
        return
      }
      const pollId = poll.id_encuesta

      // 2) cargar opciones + sus imágenes
      const { data: opts, error: optsErr } = await supabase
        .from('opciones_encuesta')
        .select('id_opcion, texto_opcion, url_imagen')
        .eq('id_encuesta',pollId)
      if (optsErr || !opts) {
        setError(optsErr?.message ?? 'Error al cargar opciones.')
        setLoading(false)
        return
      }
      opts.forEach(o => {
        nameMap.set(o.id_opcion,o.texto_opcion)
        if(o.url_imagen) imgMap.set(o.id_opcion,o.url_imagen)
      })

      // 3) conteo inicial
      const fetchCounts = async () => {
        const { data: votes, error: vErr } = await supabase
          .from('votos')
          .select('id_opcion')
          .eq('id_encuesta',pollId)
        if(vErr) {
          setError(vErr.message)
          return
        }
        const counts: Record<number,number> = {}
        votes?.forEach(v => {
          counts[v.id_opcion] = (counts[v.id_opcion]||0)+1
        })
        const arr: OptionCount[] = Array.from(nameMap.entries()).map(
          ([id,name]) => ({ name, count: counts[id]||0, url_imagen: imgMap.get(id) })
        )
        setData(arr)
      }
      await fetchCounts()

      // 4) suscripción realtime
      channel = supabase
        .channel(`votos-changes-${pollId}`)
        .on('postgres_changes',{
          event:'INSERT',schema:'public',table:'votos',
          filter:`id_encuesta=eq.${pollId}`
        },({ new: vote }) => {
          setData(cur =>
            cur.map(d =>
              d.name===nameMap.get(vote.id_opcion)
                ? { ...d, count: d.count+1 }
                : d
            )
          )
        })
        .subscribe()

      setLoading(false)
    })()

    return ()=>{ if(channel) supabase.removeChannel(channel) }
  },[])

  if(loading) return <p className={styles.info}>🔄 Cargando resultados…</p>
  if(error)   return <p className={styles.error}>{error}</p>

  const COLORS = ['#0088FE','#00C49F','#FFBB28','#FF8042']

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Resultados en tiempo real</h1>

      <div className={styles.toggleGroup}>
        <button
          className={view==='bar'?styles.toggleActive:styles.toggleButton}
          onClick={()=>setView('bar')}
        >
          Barras
        </button>
        <button
          className={view==='pie'?styles.toggleActive:styles.toggleButton}
          onClick={()=>setView('pie')}
        >
          Pastel
        </button>
      </div>

      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height={350}>
          {view==='pie' ? (
            <PieChart>
              <Pie
                data={data} dataKey="count" nameKey="name"
                cx="50%" cy="50%" outerRadius={100} label
              >
                {data.map((_,i)=>(
                  <Cell key={i} fill={COLORS[i%COLORS.length]}/>
                ))}
              </Pie>
              <Tooltip/>
              <Legend/>
            </PieChart>
          ) : (
            <BarChart data={data}>
              <XAxis dataKey="name"/>
              <YAxis allowDecimals={false}/>
              <Tooltip/>
              <Bar dataKey="count" fill="#8884d8"/>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className={styles.optionList}>
        {data.map((opt,i)=>(
          <div key={i} className={styles.optionItem}>
            {opt.url_imagen && (
              <img src={opt.url_imagen}
                   alt={opt.name}
                   className={styles.optionImg}/>
            )}
            <span className={styles.optionText}>
              {opt.name}: {opt.count} votos
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
