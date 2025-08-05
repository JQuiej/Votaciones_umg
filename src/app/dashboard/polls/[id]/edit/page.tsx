// src/app/dashboard/polls/[id]/edit/page.tsx
'use client'

import React, { useState, useEffect, ChangeEvent } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../../../../../lib/supabaseClient'
import Swal from 'sweetalert2'
import imageCompression from 'browser-image-compression';
import styles from './page.module.css'

// Interfaces
interface PollDetail {
  id_encuesta:        number
  id_tipo_votacion:   number
  titulo:             string
  descripcion:        string | null
}

interface Option {
  id_opcion?:       number
  texto_opcion:     string
  url_imagen?:      string | null
}

interface Question {
  id_pregunta?:       number
  texto_pregunta:     string
  url_imagen?:        string | null
  opciones:           Option[]
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
    const loadPollForEditing = async () => {
      setLoading(true)
      const { data:{ session } } = await supabase.auth.getSession()
      if (!session?.user.id) {
        router.replace('/auth/login')
        return
      }

      const { data: pd, error: pe } = await supabase
        .from('encuestas')
        .select('id_encuesta, id_tipo_votacion, titulo, descripcion')
        .eq('id_encuesta', pollId)
        .single()
      if (pe || !pd) {
        setError(pe?.message ?? 'Encuesta no encontrada'); setLoading(false); return
      }
      setPoll(pd)

      const { data: qs, error: qe } = await supabase
        .from('preguntas_encuesta')
        .select('id_pregunta, texto_pregunta, url_imagen')
        .eq('id_encuesta', pollId)
        .order('id_pregunta', { ascending: true })
      if (qe) {
        setError(qe.message); setLoading(false); return
      }

      const loadedQuestions: Question[] = []
      for (const q of qs || []) {
        const { data: opts, error: oe } = await supabase
          .from('opciones_pregunta')
          .select('id_opcion, texto_opcion, url_imagen')
          .eq('id_pregunta', q.id_pregunta)
          .order('id_opcion', { ascending: true })
        if (oe) {
          setError(oe.message); setLoading(false); return
        }
        loadedQuestions.push({ ...q, opciones: opts || [] })
      }
      setQuestions(loadedQuestions)
      setLoading(false)
    }
    loadPollForEditing()
  }, [pollId, router])

  const readImage = (cb: (dataUrl: string) => void) => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Opciones de compresión: puedes ajustarlas según tus necesidades
    const options = {
      maxSizeMB: 0.3,          // Tamaño máximo del archivo en MB (ej: 0.5MB)
      maxWidthOrHeight: 800,   // Redimensiona la imagen a un ancho/alto máximo de 800px
      useWebWorker: true,      // Usa un Web Worker para no bloquear la UI durante la compresión
    };

    try {
      console.log(`Tamaño original: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
      
      const compressedFile = await imageCompression(file, options);
      
      console.log(`Tamaño comprimido: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);

      // Ahora, convierte el ARCHIVO COMPRIMIDO a Base64
      const reader = new FileReader();
      reader.onload = () => {
        cb(reader.result as string);
      };
      reader.readAsDataURL(compressedFile);

    } catch (error) {
      console.error('Error al comprimir la imagen:', error);
      Swal.fire('Error', 'No se pudo procesar la imagen. Por favor, intenta con otra.', 'error');
      // Opcionalmente, limpia el input del archivo si falló
      e.target.value = '';
    }
  };

  const addQuestion = () => {
    if (!poll) return
    const newQuestion: Question = {
      texto_pregunta: '',
      url_imagen: null,
      opciones: [{ texto_opcion:'', url_imagen:null }],
    }
    setQuestions(qs => [...qs, newQuestion])
  }
  const removeQuestion = (qi:number) =>
    setQuestions(qs => qs.filter((_,i)=>i!==qi))

  const addOption = (qi:number) =>
    setQuestions(qs=>{
      const newQs = [...qs]
      newQs[qi].opciones.push({ texto_opcion:'', url_imagen:null })
      return newQs
    })
const removeOption = (questionIndex: number, optionIndex: number) => {
  setQuestions(currentQuestions =>
    currentQuestions.map((question, qIdx) => {
      // Si no es la pregunta que queremos cambiar, la devolvemos sin cambios.
      if (qIdx !== questionIndex) {
        return question;
      }
      // Si ES la pregunta, devolvemos un nuevo objeto de pregunta...
      return {
        ...question,
        // ...con un nuevo array de opciones que excluye la que queremos borrar.
        opciones: question.opciones.filter((_, oIdx) => oIdx !== optionIndex),
      };
    })
  );
};

  const handleSave = async (e:React.FormEvent) => {
    e.preventDefault()
    if (!poll) return
    setSaving(true)
    setError(null)

    try {
      const { error: pollUpdateError } = await supabase
        .from('encuestas')
        .update({ titulo: poll.titulo, descripcion: poll.descripcion })
        .eq('id_encuesta', pollId)
      if (pollUpdateError) throw pollUpdateError

      // Estrategia de "borrar y recrear" para simplificar la lógica de edición.
      const { error: deleteQError } = await supabase
        .from('preguntas_encuesta')
        .delete()
        .eq('id_encuesta', pollId)
      if (deleteQError) throw deleteQError

      for (const q of questions) {
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
          })
          .select('id_pregunta')
          .single()
        if (newQErr || !newQ) throw newQErr

        const optionsToInsert = q.opciones
          .filter(o=>o.texto_opcion.trim())
          .map(o=>({
            id_pregunta:      newQ.id_pregunta,
            texto_opcion:     o.texto_opcion.trim(),
            url_imagen:       o.url_imagen || null
          }))
        if (optionsToInsert.length > 0) {
          const { error: optErr } = await supabase
            .from('opciones_pregunta')
            .insert(optionsToInsert)
          if (optErr) throw optErr
        }
      }

      Swal.fire('¡Éxito!', 'Los cambios han sido guardados.', 'success')
      router.push(`/dashboard/polls/${pollId}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ocurrió un error desconocido.'
      setError(message)
      Swal.fire('Error al guardar', message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className={styles.info}>🔄 Cargando...</p>
  if (error)   return <p className={styles.error}>Error: {error}</p>
  if (!poll)   return null

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>
          ← Regresar
        </button>
        <h1 className={styles.title}>Editar Encuesta</h1>
      </div>

      <form onSubmit={handleSave} className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="pollTitle" className={styles.label}>Título de la Encuesta</label>
          <input id="pollTitle" type="text" value={poll.titulo} onChange={e => setPoll(p => p && { ...p, titulo: e.target.value })} className={styles.input} required />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="pollDescription" className={styles.label}>Descripción</label>
          <textarea id="pollDescription" value={poll.descripcion || ''} onChange={e => setPoll(p => p && { ...p, descripcion: e.target.value })} className={styles.textarea} rows={3} />
        </div>

        {/* --- Lógica de renderizado unificada --- */}

        {questions.map((q, qi) => (
          <fieldset key={qi} className={styles.questionBlock}>
            <legend className={styles.legend}>
              Pregunta #{qi + 1}
              <button type="button" onClick={() => removeQuestion(qi)} className={styles.removeBtn}>×</button>
            </legend>
            <div className={styles.formGroup}>
              <label className={styles.label}>Texto de la Pregunta</label>
              <input className={styles.input} value={q.texto_pregunta} onChange={e => {const qs = [...questions]; qs[qi].texto_pregunta = e.target.value; setQuestions(qs)}} placeholder="Escribe el texto de la pregunta aquí" required />
            </div>
            <div className={styles.imageUploadGroup}>
              <label className={styles.label}>Imagen de la Pregunta (Opcional)</label>
              {q.url_imagen ? (
                <div className={styles.imagePreviewContainer}>
                  <Image src={q.url_imagen} alt="Preview" width={80} height={80} className={styles.previewImg} />
                  <button type="button" onClick={() => {const qs = [...questions]; qs[qi].url_imagen = null; setQuestions(qs)}} className={styles.removeImageBtn}>×</button>
                </div>
              ) : (
                <input type="file" accept="image/*" onChange={readImage(url => {const qs = [...questions]; qs[qi].url_imagen = url; setQuestions(qs)})} className={styles.fileInput} />
              )}
            </div>
            
            {/* Opciones para todos los tipos que las usan */}
            <div className={styles.optionsSection}>
              <label className={styles.label}>Opciones</label>
              {q.opciones.map((opt, oi) => (
                <div key={oi} className={styles.optionRow}>
                    <input 
                      className={styles.input} 
                      value={opt.texto_opcion} 
                      onChange={e => {
                        const newText = e.target.value;
                        setQuestions(qs => qs.map((q, qIdx) => qIdx === qi ? {
                            ...q,
                            opciones: q.opciones.map((o, oIdx) => oIdx === oi ? { ...o, texto_opcion: newText } : o)
                          } : q
                        ))
                      }} 
                      placeholder={`Opción #${oi + 1}`} 
                      required 
                    />                  {poll.id_tipo_votacion !== 3 && ( // Las opciones de puntuación no tienen imagen individual
                    <div className={styles.imageUploadGroup}>
                      {opt.url_imagen ? (
                        <div className={styles.imagePreviewContainer}>
                          <Image src={opt.url_imagen} alt="Preview" width={40} height={40} className={styles.previewImg} />
                          <button type="button" onClick={() => {const qs = [...questions]; qs[qi].opciones[oi].url_imagen = null; setQuestions(qs)}} className={styles.removeImageBtn}>×</button>
                        </div>
                      ) : (
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={readImage(url => {
                            setQuestions(qs => qs.map((q, qIdx) => qIdx === qi ? {
                                ...q,
                                opciones: q.opciones.map((o, oIdx) => oIdx === oi ? { ...o, url_imagen: url } : o)
                              } : q
                            ))
                          })} 
                          className={styles.fileInput} 
                        />                      )}
                    </div>
                  )}
                  <button type="button" onClick={() => removeOption(qi, oi)} className={styles.removeBtn}>×</button>
                </div>
              ))}
              <button type="button" onClick={() => addOption(qi)} className={styles.addBtn}>
                + Agregar Opción
              </button>
            </div>
          </fieldset>
        ))}
        <button type="button" onClick={addQuestion} className={styles.addQuestionBtn}>
          + Agregar Pregunta
        </button>

        <button type="submit" className={styles.submitBtn} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar Cambios'}
        </button>
      </form>
    </div>
  )
}