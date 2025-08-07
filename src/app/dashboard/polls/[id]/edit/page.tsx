// src/app/dashboard/polls/[id]/edit/page.tsx
'use client'

import React, { useState, useEffect, ChangeEvent, useRef, Fragment } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../../../../../lib/supabaseClient'
import Swal from 'sweetalert2'
import imageCompression from 'browser-image-compression'
import styles from './page.module.css'

// Interfaces
interface Option {
  id_opcion?: number
  texto_opcion: string
  url_imagen?: string | null
}
interface Question {
  id_pregunta?: number
  texto_pregunta: string
  url_imagen?: string | null
  opciones: Option[]
}
interface PollDetail {
  id_encuesta: number
  id_tipo_votacion: number
  titulo: string
  descripcion: string | null
}

export default function EditPollPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const pollId = Number(id)

  const [poll, setPoll] = useState<PollDetail | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const originalRef = useRef<Question[]>([])

  // Carga inicial
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user.id) return router.replace('/auth/login')

      const { data: pd, error: pe } = await supabase
        .from('encuestas')
        .select('id_encuesta, id_tipo_votacion, titulo, descripcion')
        .eq('id_encuesta', pollId)
        .single()
      if (pe || !pd) {
        setError(pe?.message ?? 'Encuesta no encontrada')
        setLoading(false)
        return
      }
      setPoll(pd)
      
      const { data: qs, error: qe } = await supabase
        .from('preguntas_encuesta')
        .select('id_pregunta, texto_pregunta, url_imagen, opciones_pregunta(id_opcion, texto_opcion, url_imagen)')
        .eq('id_encuesta', pollId)
        .order('id_pregunta', { ascending: true })
        .order('id_opcion', { foreignTable: 'opciones_pregunta', ascending: true });

      if (qe) {
        setError(qe.message)
        setLoading(false)
        return
      }
      
      const loaded: Question[] = qs.map(q => ({ ...q, opciones: q.opciones_pregunta || [] }));

      setQuestions(loaded)
      originalRef.current = loaded.map(q => ({
        ...q,
        opciones: q.opciones.map(o => ({ ...o }))
      }))
      setLoading(false)
    }
    load()
  }, [pollId, router])

  // Helper de compresión de imagen
  const readImage = (cb: (u: string) => void) => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const comp = await imageCompression(file, { maxSizeMB: 0.3, maxWidthOrHeight: 800, useWebWorker: true })
      const r = new FileReader()
      r.onload = () => cb(r.result as string)
      r.readAsDataURL(comp)
    } catch {
      Swal.fire('Error', 'No se pudo procesar la imagen', 'error')
      e.target.value = ''
    }
  }

  // Manipulaciones de la UI
  const handleRemoveQuestion = (qi: number) => setQuestions(qs => qs.filter((_, i) => i !== qi))

  const handleRemoveOption = (qi: number, oi: number) =>
    setQuestions(qs =>
      qs.map((q, i) =>
        i === qi ? { ...q, opciones: q.opciones.filter((_, j) => j !== oi) } : q
      )
    )

  const addQuestion = () =>
    setQuestions(qs => [...qs, {
      texto_pregunta: '',
      url_imagen: null,
      opciones: [{ texto_opcion: '', url_imagen: null }]
    }])

  const addOption = (qi: number) => {
    setQuestions(currentQuestions =>
      currentQuestions.map((question, index) => {
        if (index === qi) {
          return {
            ...question,
            opciones: [
              ...question.opciones,
              { texto_opcion: '', url_imagen: null }
            ]
          };
        }
        return question;
      })
    );
  };

  // Lógica de guardado con todas las mejoras
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poll) return;
    setSaving(true);
    setError(null);

    // 1. Mostrar alerta de "cargando"
    Swal.fire({
      title: 'Guardando cambios...',
      text: 'Por favor, espera un momento.',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      // 2. Actualizar encuesta
      const { error: pe } = await supabase
        .from('encuestas')
        .update({ titulo: poll.titulo, descripcion: poll.descripcion })
        .eq('id_encuesta', pollId);
      if (pe) throw pe;

      // 3. Identificar y borrar preguntas eliminadas
      const origQs = originalRef.current;
      const origQIds = origQs.map((q) => q.id_pregunta!).filter(Boolean);
      const currQIds = questions.map((q) => q.id_pregunta!).filter(Boolean);
      const toDeleteQ = origQIds.filter((id) => !currQIds.includes(id));

      if (toDeleteQ.length > 0) {
        const deletePromises = toDeleteQ.map((idq) =>
          supabase.rpc('delete_full_question', { target_qid: idq })
        );
        const results = await Promise.all(deletePromises);
        results.forEach(({ error }) => { if (error) throw error; });
      }

      // 4. Iterar preguntas actuales para actualizar o insertar
      for (const q of questions) {
        let qId = q.id_pregunta;
        if (qId) {
          // UPDATE de pregunta existente con verificación
          const { data: updatedQ, error } = await supabase
            .from('preguntas_encuesta')
            .update({
              texto_pregunta: q.texto_pregunta.trim(),
              url_imagen: q.url_imagen || null,
            })
            .eq('id_pregunta', qId)
            .select();
          if (error) throw error;
          if (!updatedQ || updatedQ.length === 0) throw new Error(`Falló la actualización de la pregunta #${qId}. Revisa los permisos (RLS).`);
        } else {
          // INSERT de nueva pregunta
          const { data: newQ, error } = await supabase
            .from('preguntas_encuesta')
            .insert({
              id_encuesta: pollId,
              id_tipo_votacion: poll.id_tipo_votacion,
              texto_pregunta: q.texto_pregunta.trim(),
              url_imagen: q.url_imagen || null,
            })
            .select('id_pregunta')
            .single();
          if (error || !newQ) throw error;
          qId = newQ.id_pregunta;
          q.id_pregunta = qId;
        }

        // 5. Procesar opciones para la pregunta actual
        const origOpts = origQs.find((x) => x.id_pregunta === qId)?.opciones || [];
        const origOIds = origOpts.map((o) => o.id_opcion!).filter(Boolean);
        const currOIds = q.opciones.map((o) => o.id_opcion!).filter(Boolean);

        // Borrar opciones eliminadas
        const toDelO = origOIds.filter((id) => !currOIds.includes(id));
        if (toDelO.length > 0) {
          const deletePromises = toDelO.map((ido) =>
            supabase.rpc('delete_full_option', { target_oid: ido })
          );
          const results = await Promise.all(deletePromises);
          results.forEach(({ error }) => { if (error) throw error; });
        }

        // Actualizar o insertar opciones
        for (const o of q.opciones) {
          if (o.id_opcion) {
            // UPDATE de opción existente con verificación
            const { data: updatedO, error } = await supabase
              .from('opciones_pregunta')
              .update({
                texto_opcion: o.texto_opcion.trim(),
                url_imagen: o.url_imagen || null,
              })
              .eq('id_opcion', o.id_opcion)
              .select();
            if (error) throw error;
            if (!updatedO || updatedO.length === 0) throw new Error(`Falló la actualización de la opción #${o.id_opcion}. Revisa los permisos (RLS).`);
          } else {
            // INSERT de nueva opción
            const { error } = await supabase.from('opciones_pregunta').insert({
              id_pregunta: qId!,
              texto_opcion: o.texto_opcion.trim(),
              url_imagen: o.url_imagen || null,
            });
            if (error) throw error;
          }
        }
      }

      // 6. Mostrar alerta de éxito y redirigir
      Swal.fire(
        '¡Éxito!',
        'Se guardaron los cambios.',
        'success'
      ).then(() => {
        router.back();
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message);
      // 7. Mostrar alerta de error
      Swal.fire('Error', err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className={styles.info}>🔄 Cargando…</p>
  if (error) return <p className={styles.error}>Error: {error}</p>
  if (!poll) return null

  // Renderizado del formulario
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>← Regresar</button>
        <h1 className={styles.title}>Editar Encuesta</h1>
      </div>

      <form onSubmit={handleSave} className={styles.form}>
        {/* Título y Descripción */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Título</label>
          <input value={poll.titulo} onChange={e => setPoll(p => p && ({ ...p, titulo: e.target.value }))} className={styles.input} required />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Descripción</label>
          <textarea value={poll.descripcion || ''} onChange={e => setPoll(p => p && ({ ...p, descripcion: e.target.value }))} className={styles.textarea} rows={3} />
        </div>

        {/* Preguntas y Opciones */}
        {questions.map((q, qi) => (
          <fieldset key={q.id_pregunta || `new-${qi}`} className={styles.questionBlock}>
            <legend className={styles.legend}>
              Pregunta #{qi + 1}
              <button type="button" onClick={() => handleRemoveQuestion(qi)} className={styles.removeBtn}>×</button>
            </legend>
            <div className={styles.formGroup}>
              <input value={q.texto_pregunta} onChange={e => { const t = e.target.value; setQuestions(cs => cs.map((qq, i) => i === qi ? { ...qq, texto_pregunta: t } : qq)) }} className={styles.input} placeholder="Texto de la pregunta" required />
            </div>

            <div className={styles.imageUploadGroup}>
              {q.url_imagen ? (
                <div className={styles.imagePreviewContainer}>
                  <label htmlFor={`q-img-upload-${qi}`} className={styles.imageLabel}>
                    <Image src={q.url_imagen} alt="Preview" width={80} height={80} className={styles.previewImg} />
                  </label>
                  <input
                    type="file"
                    id={`q-img-upload-${qi}`}
                    accept="image/*"
                    onChange={readImage(url => setQuestions(cs => cs.map((qq, i) => i === qi ? { ...qq, url_imagen: url } : qq)))}
                    style={{ display: 'none' }}
                  />
                  <button type="button" onClick={() => setQuestions(cs => cs.map((qq, i) => i === qi ? { ...qq, url_imagen: null } : qq))} className={styles.removeImageBtn}>X</button>
                </div>
              ) : (
                <input type="file" accept="image/*" onChange={readImage(url => setQuestions(cs => cs.map((qq, i) => i === qi ? { ...qq, url_imagen: url } : qq)))} className={styles.fileInput} />
              )}
            </div>

            <div className={styles.optionsSection}>
              <label className={styles.label}>Opciones</label>
              {q.opciones.map((opt, oi) => (
                <div key={opt.id_opcion || `new-opt-${oi}`} className={styles.optionRow}>
                  <input
                    value={opt.texto_opcion}
                    onChange={e => {
                      const t = e.target.value
                      setQuestions(cs => cs.map((qq, i) => i === qi ? {
                        ...qq,
                        opciones: qq.opciones.map((oo, j) => j === oi ? { ...oo, texto_opcion: t } : oo)
                      } : qq))
                    }}
                    className={styles.input}
                    placeholder={`Opción #${oi + 1}`}
                    required
                  />
                  {poll.id_tipo_votacion !== 3 && (
                    <div className={styles.imageUploadGroup}>
                      {opt.url_imagen ? (
                        <div className={styles.imagePreviewContainer}>
                           <label htmlFor={`opt-img-upload-${qi}-${oi}`} className={styles.imageLabel}>
                             <Image src={opt.url_imagen} alt="Preview" width={40} height={40} className={styles.previewImg} />
                           </label>
                           <input
                              type="file"
                              id={`opt-img-upload-${qi}-${oi}`}
                              accept="image/*"
                              onChange={readImage(url => setQuestions(cs => cs.map((qq, i) => i === qi ? { ...qq, opciones: qq.opciones.map((oo, j) => j === oi ? { ...oo, url_imagen: url } : oo) } : qq)))}
                              style={{ display: 'none' }}
                            />
                          <button type="button" onClick={() => setQuestions(cs => cs.map((qq, i) => i === qi ? { ...qq, opciones: qq.opciones.map((oo, j) => j === oi ? { ...oo, url_imagen: null } : oo) } : qq))} className={styles.removeImageBtn}>×</button>
                        </div>
                      ) : (
                        <input type="file" accept="image/*" onChange={readImage(url => setQuestions(cs => cs.map((qq, i) => i === qi ? { ...qq, opciones: qq.opciones.map((oo, j) => j === oi ? { ...oo, url_imagen: url } : oo) } : qq)))} className={styles.fileInput} />
                      )}
                    </div>
                  )}
                  <button type="button" onClick={() => handleRemoveOption(qi, oi)} className={styles.removeBtn}>×</button>
                </div>
              ))}
              <button type="button" onClick={() => addOption(qi)} className={styles.addBtn}>+ Agregar Opción</button>
            </div>
          </fieldset>
        ))}
        <button type="button" onClick={addQuestion} className={styles.addQuestionBtn}>+ Agregar Pregunta</button>
        <button type="submit" className={styles.submitBtn} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar Cambios'}
        </button>
      </form>
    </div>
  )
}
