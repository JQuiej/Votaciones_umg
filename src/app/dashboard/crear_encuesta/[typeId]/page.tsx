// src/app/dashboard/crear_encuesta/[typeId]/page.tsx
'use client'

import React, { useState, useEffect, ChangeEvent } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../../../../lib/supabaseClient'
import { Eye } from 'lucide-react'
import Swal from 'sweetalert2'
import styles from './page.module.css'

// Interfaces
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
  options: string[]
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

  const [typeName, setTypeName] = useState('')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const [candidates, setCandidates] = useState<Candidate[]>([{ name: '', imageBase64: '' }])
  const [multiQuestions, setMultiQuestions] = useState<MultipleQuestion[]>([{ question: '', options: [''], imageBase64: '' }])
  const [scoreQuestions, setScoreQuestions] = useState<ScoringQuestion[]>([{ question: '', options: [''], imageBase64: '' }])
  const [rankQuestions, setRankQuestions] = useState<RankingQuestion[]>([{ question: '', choices: [{ text: '', score: 0 }], imageBase64: '' }])
  const [preview, setPreview] = useState(false)

  const isCandidates = Number(typeId) === 1
  const isMultiple = typeName === 'Opción múltiple'
  const isScoring = typeName === 'Puntuación'
  const isRanking = typeName === 'Ranking'

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

  const validateForm = () => {
    if (!titulo.trim()) {
      Swal.fire('Campo Requerido', 'El título de la encuesta no puede estar vacío.', 'warning');
      return false;
    }
  
    if (isCandidates) {
      if (candidates.some(c => !c.name.trim())) {
        Swal.fire('Campo Requerido', 'Todas las opciones deben tener un nombre.', 'warning');
        return false;
      }
    } else if (isMultiple) {
      if (multiQuestions.some(q => !q.question.trim() || q.options.some(opt => !opt.trim()))) {
        Swal.fire('Campos Requeridos', 'Toda pregunta y sus opciones deben tener texto.', 'warning');
        return false;
      }
    } else if (isScoring) {
      if (scoreQuestions.some(q => !q.question.trim() || q.options.some(opt => !opt.trim()))) {
        Swal.fire('Campos Requeridos', 'Toda pregunta de puntuación y sus opciones deben tener texto.', 'warning');
        return false;
      }
    } else if (isRanking) {
      if (rankQuestions.some(q => !q.question.trim() || q.choices.some(c => !c.text.trim()))) {
        Swal.fire('Campos Requeridos', 'Toda pregunta y sus opciones de ranking deben tener texto.', 'warning');
        return false;
      }
    }
  
    return true;
  };

  const handlePreview = () => {
    if (validateForm()) {
      setPreview(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    Swal.fire({
      title: 'Creando encuesta...',
      text: 'Por favor, espera.',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user.id) return router.replace('/auth/login');

    const code = generateAccessCode(8);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    const url = `${baseUrl}/vote/${code}`;

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
      .single();

    if (encErr || !enc) {
      Swal.fire({ icon: 'error', title: '¡Oops!', text: encErr?.message || 'No se pudo crear la encuesta.' });
      return;
    }
    const pollId = enc.id_encuesta;

    try {
      if (isCandidates) {
        const { data: pq, error: pqErr } = await supabase.from('preguntas_encuesta').insert({id_encuesta: pollId, id_tipo_votacion: Number(typeId), texto_pregunta: 'Opciones', url_imagen: null}).select('id_pregunta').single()
        if (pqErr || !pq) throw pqErr
        await supabase.from('opciones_pregunta').insert(candidates.filter(c => c.name.trim()).map(c => ({id_pregunta: pq.id_pregunta, texto_opcion: c.name.trim(), url_imagen: c.imageBase64 || null})))
      } else if (isMultiple) {
        for (const q of multiQuestions) {
          const { data: pq, error: pqErr } = await supabase.from('preguntas_encuesta').insert({id_encuesta: pollId, id_tipo_votacion: Number(typeId), texto_pregunta: q.question.trim(), url_imagen: q.imageBase64 || null}).select('id_pregunta').single()
          if (pqErr || !pq) throw pqErr
          await supabase.from('opciones_pregunta').insert(q.options.filter(o => o.trim()).map(opt => ({id_pregunta: pq.id_pregunta, texto_opcion: opt.trim(), url_imagen: null })))
        }
      } else if (isScoring) {
        for (const q of scoreQuestions) {
          const { data: pq, error: pqErr } = await supabase.from('preguntas_encuesta').insert({id_encuesta: pollId, id_tipo_votacion: Number(typeId), texto_pregunta: q.question.trim(), url_imagen: q.imageBase64 || null}).select('id_pregunta').single();
          if (pqErr || !pq) throw pqErr;
          await supabase.from('opciones_pregunta').insert(q.options.filter(o => o.trim()).map(opt => ({id_pregunta: pq.id_pregunta, texto_opcion: opt.trim(), url_imagen: null })));
        }
      } else if (isRanking) {
        for (const q of rankQuestions) {
          const { data: pq, error: pqErr } = await supabase.from('preguntas_encuesta').insert({id_encuesta: pollId, id_tipo_votacion: Number(typeId), texto_pregunta: q.question.trim(), url_imagen: q.imageBase64 || null}).select('id_pregunta').single()
          if (pqErr || !pq) throw pqErr
          await supabase.from('opciones_pregunta').insert(q.choices.filter(c => c.text.trim()).map(c => ({id_pregunta: pq.id_pregunta, texto_opcion: c.text.trim(), url_imagen: null})))
        }
      }

      Swal.fire({
        icon: 'success',
        title: '¡Encuesta Creada!',
        text: 'Tu encuesta ha sido creada exitosamente.',
        timer: 2000,
        showConfirmButton: false,
      }).then(() => router.push(`/dashboard/polls/${pollId}`));

    } catch (err) {
      let message = 'Ocurrió un error desconocido.';
      if (err instanceof Error) message = err.message;
      Swal.fire({ icon: 'error', title: 'Error al guardar preguntas', text: message });
    }
  };
  
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
                  {c.imageBase64 && <Image src={c.imageBase64} alt={c.name || 'Imagen de opción'} width={40} height={40} className={styles.optionImg} />}
                  <span>{c.name}</span>
                </label>
              ))}
            </fieldset>
          )}
          {isMultiple && multiQuestions.map((q, qi) => (
            <fieldset key={qi} className={styles.fieldset}>
              <legend>{q.question}</legend>
              {q.imageBase64 && <Image src={q.imageBase64} alt={q.question || 'Imagen de pregunta'} width={100} height={100} className={styles.previewImg} />}
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
              {q.imageBase64 && <Image src={q.imageBase64} alt={q.question || 'Imagen de pregunta'} width={100} height={100} className={styles.previewImg} />}
              {q.options.map((opt, oi) => (
                <div key={oi} className={styles.optionItem}>
                  <span>{opt}</span>
                  <input type="number" min={1} max={10} disabled className={styles.inputNumber} style={{width: '80px', marginLeft: 'auto'}}/>
                </div>
              ))}
            </fieldset>
          ))}
          {isRanking && rankQuestions.map((q, qi) => (
            <fieldset key={qi} className={styles.fieldset}>
              <legend>{q.question}</legend>
              {q.imageBase64 && <Image src={q.imageBase64} alt={q.question || 'Imagen de pregunta'} width={100} height={100} className={styles.previewImg} />}
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
        <div className={styles.field}>
          <label>Título</label>
          <input className={styles.input} value={titulo} onChange={e => setTitulo(e.target.value)} required />
        </div>
        <div className={styles.field}>
          <label>Descripción</label>
          <textarea className={styles.textarea} value={descripcion} onChange={e => setDescripcion(e.target.value)} />
        </div>

        {isCandidates && candidates.map((c, i) => (
          <div key={i} className={styles.card}>
            <input className={styles.input} placeholder="Nombre de la opción" value={c.name} onChange={e => {const arr = [...candidates]; arr[i].name = e.target.value; setCandidates(arr)}} required />
            {c.imageBase64 ? (
              <div className={styles.imagePreview}>
                <Image src={c.imageBase64} alt="Vista previa" width={50} height={50} className={styles.thumb} />
                <button type="button" onClick={() => {const arr = [...candidates]; arr[i].imageBase64 = ''; setCandidates(arr);}} className={styles.removeImgBtn}>Quitar</button>
              </div>
            ) : (
              <input className={styles.input} type="file" accept="image/*" onChange={readImage(dataUrl => {const arr = [...candidates]; arr[i].imageBase64 = dataUrl; setCandidates(arr)})} />
            )}
            {candidates.length > 1 && (<button type="button" onClick={() => removeCandidate(i)} className={styles.removeBtn}>Eliminar Opción</button>)}
          </div>
        ))}
        {isCandidates && (<button type="button" onClick={addCandidate} className={styles.button}>+ Agregar Opción</button>)}

        {isMultiple && multiQuestions.map((q, i) => (
          <div key={i} className={styles.card}>
            <input className={styles.input} placeholder="Pregunta" value={q.question} onChange={e => {const arr = [...multiQuestions]; arr[i].question = e.target.value; setMultiQuestions(arr)}} required />
            {q.imageBase64 ? (
              <div className={styles.imagePreview}>
                <Image src={q.imageBase64} alt="Vista previa" width={50} height={50} className={styles.thumb} />
                <button type="button" onClick={() => {const arr = [...multiQuestions]; arr[i].imageBase64 = ''; setMultiQuestions(arr);}} className={styles.removeImgBtn}>Quitar</button>
              </div>
            ) : (
              <input className={styles.input} type="file" accept="image/*" onChange={readImage(dataUrl => {const arr = [...multiQuestions]; arr[i].imageBase64 = dataUrl; setMultiQuestions(arr)})}/>
            )}
            {q.options.map((opt, j) => (
              <div key={j} className={styles.optionRow}>
                <input className={styles.input} placeholder={`Opción #${j + 1}`} value={opt} onChange={e => {const arr = [...multiQuestions]; arr[i].options[j] = e.target.value; setMultiQuestions(arr)}} required />
                {q.options.length > 1 && (<button type="button" onClick={() => {const arr = [...multiQuestions]; arr[i].options.splice(j, 1); setMultiQuestions(arr)}} className={styles.removeBtnMini}>×</button>)}
              </div>
            ))}
            <button type="button" onClick={() => {const arr = [...multiQuestions]; arr[i].options.push(''); setMultiQuestions(arr)}} className={styles.button}>+ Agregar opción</button>
            {multiQuestions.length > 1 && (<button type="button" onClick={() => {const arr = [...multiQuestions]; arr.splice(i, 1); setMultiQuestions(arr)}} className={styles.removeBtn}>Eliminar Pregunta</button>)}
          </div>
        ))}
        {isMultiple && (<button type="button" onClick={() => setMultiQuestions(prev => [...prev, { question: '', options: [''], imageBase64: '' }])} className={styles.button}>+ Agregar pregunta</button>)}

        {isScoring && scoreQuestions.map((q, i) => (
          <div key={i} className={styles.card}>
            <input className={styles.input} placeholder="Pregunta (ej: Califica nuestros servicios)" value={q.question} onChange={e => {const arr = [...scoreQuestions]; arr[i].question = e.target.value; setScoreQuestions(arr)}} required />
            {q.imageBase64 ? (
              <div className={styles.imagePreview}>
                <Image src={q.imageBase64} alt="Vista previa" width={50} height={50} className={styles.thumb} />
                <button type="button" onClick={() => {const arr = [...scoreQuestions]; arr[i].imageBase64 = ''; setScoreQuestions(arr);}} className={styles.removeImgBtn}>Quitar</button>
              </div>
            ) : (
              <input className={styles.input} type="file" accept="image/*" onChange={readImage(dataUrl => {const arr = [...scoreQuestions]; arr[i].imageBase64 = dataUrl; setScoreQuestions(arr)})}/>
            )}
            <label className={styles.subtleLabel}>Opciones a calificar (de 1 a 10):</label>
            {q.options.map((opt, j) => (
              <div key={j} className={styles.optionRow}>
                <input className={styles.input} placeholder={`Opción #${j + 1} (ej: Calidad)`} value={opt} onChange={e => {const arr = [...scoreQuestions]; arr[i].options[j] = e.target.value; setScoreQuestions(arr)}} required />
                {q.options.length > 1 && (<button type="button" onClick={() => {const arr = [...scoreQuestions]; arr[i].options.splice(j, 1); setScoreQuestions(arr)}} className={styles.removeBtnMini}>×</button>)}
              </div>
            ))}
            <button type="button" onClick={() => {const arr = [...scoreQuestions]; arr[i].options.push(''); setScoreQuestions(arr)}} className={styles.button}>+ Agregar opción a calificar</button>
            {scoreQuestions.length > 1 && (<button type="button" onClick={() => {const arr = [...scoreQuestions]; arr.splice(i, 1); setScoreQuestions(arr)}} className={styles.removeBtn}>Eliminar Pregunta</button>)}
          </div>
        ))}
        {isScoring && (<button type="button" onClick={() => setScoreQuestions(prev => [...prev, { question: '', options: [''], imageBase64: '' }])} className={styles.button}>+ Agregar pregunta</button>)}

        {isRanking && rankQuestions.map((q, i) => (
          <div key={i} className={styles.card}>
            <input className={styles.input} placeholder="Pregunta" value={q.question} onChange={e => {const arr = [...rankQuestions]; arr[i].question = e.target.value; setRankQuestions(arr)}} required />
            {q.imageBase64 ? (
              <div className={styles.imagePreview}>
                <Image src={q.imageBase64} alt="Vista previa" width={50} height={50} className={styles.thumb} />
                <button type="button" onClick={() => {const arr = [...rankQuestions]; arr[i].imageBase64 = ''; setRankQuestions(arr);}} className={styles.removeImgBtn}>Quitar</button>
              </div>
            ) : (
              <input className={styles.input} type="file" accept="image/*" onChange={readImage(dataUrl => {const arr = [...rankQuestions]; arr[i].imageBase64 = dataUrl; setRankQuestions(arr)})}/>
            )}
            <label className={styles.subtleLabel}>Opciones a rankear:</label>
            {q.choices.map((c, j) => (
              <div key={j} className={styles.optionRow}>
                <input className={styles.input} placeholder="Opción a rankear" value={c.text} onChange={e => {const arr = [...rankQuestions]; arr[i].choices[j].text = e.target.value; setRankQuestions(arr)}} required />
                {q.choices.length > 1 && (<button type="button" onClick={() => {const arr = [...rankQuestions]; arr[i].choices.splice(j, 1); setRankQuestions(arr)}} className={styles.removeBtnMini}>×</button>)}
              </div>
            ))}
            <button type="button" onClick={() => {const arr = [...rankQuestions]; arr[i].choices.push({ text: '', score: 0 }); setRankQuestions(arr)}} className={styles.button}>+ Agregar opción</button>
            {rankQuestions.length > 1 && (<button type="button" onClick={() => {const arr = [...rankQuestions]; arr.splice(i, 1); setRankQuestions(arr)}} className={styles.removeBtn}>Eliminar Pregunta</button>)}
          </div>
        ))}
        {isRanking && (<button type="button" onClick={() => setRankQuestions(prev => [...prev, { question: '', choices: [{ text: '', score: 0 }], imageBase64: '' }])} className={styles.button}>+ Agregar pregunta</button>)}

        <div className={styles.actions}>
          <button type="button" onClick={handlePreview} className={styles.previewBtn}>
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