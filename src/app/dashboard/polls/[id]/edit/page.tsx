'use client'

import React, { useState, useEffect, ChangeEvent, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { UserPlus, X } from 'lucide-react'
import { supabase } from '../../../../../lib/supabaseClient'
import Swal from 'sweetalert2'
import imageCompression from 'browser-image-compression'
import styles from './page.module.css'

// Interfaces actualizadas para manejar archivos
interface EditableOption {
  id_opcion?: number
  texto_opcion: string
  url_imagen: string | null
  imageFile?: File | null
  previewUrl?: string | null
}

interface Judge {
    id_juez: number;
    nombre_completo: string;
    url_imagen: string | null;
}

interface EditableQuestion {
  id_pregunta?: number
  texto_pregunta: string
  url_imagen: string | null
  imageFile?: File | null
  previewUrl?: string | null
  opciones: EditableOption[]
}

interface PollDetail {
  id_encuesta: number
  id_tipo_votacion: number
  titulo: string
  descripcion: string | null
  tipo_votacion: { nombre: string }
}

export default function EditPollPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const pollId = Number(id)

  const [poll, setPoll] = useState<PollDetail | null>(null)
  const [questions, setQuestions] = useState<EditableQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // --- AÑADE ESTOS NUEVOS ESTADOS ---
    const [allJudges, setAllJudges] = useState<Judge[]>([]); // Para la lista completa de jueces
    const [assignedJudges, setAssignedJudges] = useState<Judge[]>([]); // Para los jueces de esta encuesta
    const originalAssignedJudgesRef = useRef<Judge[]>([]); // Para comparar al guardar
    
  const originalRef = useRef<EditableQuestion[]>([])

  const isProjects = poll?.tipo_votacion.nombre === 'Proyectos';
  const isCandidates = poll?.tipo_votacion.nombre === 'Candidatas';

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user.id) return router.replace('/auth/login')

      const { data: pd, error: pe } = await supabase
        .from('encuestas')
        .select('id_encuesta, id_tipo_votacion, titulo, descripcion, tipo_votacion:id_tipo_votacion (nombre)')
        .eq('id_encuesta', pollId)
        .single()
      if (pe || !pd) {
        setError(pe?.message ?? 'Encuesta no encontrada');
        setLoading(false);
        return
      }
      setPoll({
        ...pd,
        tipo_votacion: Array.isArray(pd.tipo_votacion) ? pd.tipo_votacion[0] : pd.tipo_votacion
      })

       // --- AÑADE ESTA LÓGICA PARA CARGAR JUECES ---
    if (pd.id_tipo_votacion === 4) { // Asumiendo que 4 es Proyectos
      // 1. Cargar TODOS los jueces disponibles del usuario
      const { data: allJudgesData, error: allJudgesError } = await supabase
          .from('jueces')
          .select('id_juez, nombre_completo, url_imagen')
          .eq('id_usuario_creador', session.user.id);
      if (allJudgesError) console.error("Error al cargar todos los jueces:", allJudgesError);
      else setAllJudges(allJudgesData || []);

      // 2. Cargar los jueces YA ASIGNADOS a esta encuesta
      const { data: assignedJudgesData, error: assignedError } = await supabase
          .from('encuesta_jueces')
          .select('jueces(id_juez, nombre_completo, url_imagen)')
          .eq('id_encuesta', pollId);
      
      if (assignedError) console.error("Error al cargar jueces asignados:", assignedError);
      else {
          const currentlyAssigned = assignedJudgesData.map((j: any) => j.jueces).filter(Boolean);
          setAssignedJudges(currentlyAssigned);
          originalAssignedJudgesRef.current = currentlyAssigned; // Guardar estado original
      }
    }
      
      const { data: qs, error: qe } = await supabase
        .from('preguntas_encuesta')
        .select('id_pregunta, texto_pregunta, url_imagen, opciones_pregunta(id_opcion, texto_opcion, url_imagen)')
        .eq('id_encuesta', pollId)
        .order('id_pregunta', { ascending: true })
        .order('id_opcion', { foreignTable: 'opciones_pregunta', ascending: true });

      if (qe) {
        setError(qe.message);
        setLoading(false);
        return
      }
      
      const loaded: EditableQuestion[] = qs.map(q => ({ ...q, opciones: q.opciones_pregunta || [] }));

      setQuestions(loaded)
      originalRef.current = JSON.parse(JSON.stringify(loaded)); // Deep copy
      setLoading(false)
    }
    load()
  }, [pollId, router])

  const handleImageChange = async (
    file: File,
    updater: (file: File, previewUrl: string) => void
  ) => {
    try {
      const compressedFile = await imageCompression(file, { maxSizeMB: 0.3, maxWidthOrHeight: 800, useWebWorker: true });
      const previewUrl = URL.createObjectURL(compressedFile);
      updater(compressedFile, previewUrl);
    } catch {
      Swal.fire('Error', 'No se pudo procesar la imagen', 'error');
    }
  };

  // --- LÓGICA DE GUARDADO TOTALMENTE REHECHA ---
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poll) return;
    setSaving(true);
    setError(null);

    Swal.fire({
      title: 'Guardando cambios...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user.id) {
        Swal.fire('Error', 'Sesión no válida', 'error');
        return;
    }

    const filesToDelete = {
        imagenes_proyectos: [] as string[],
        imagenes_candidatos: [] as string[],
    };

    const extractPath = (url: string, bucket: string) => {
        // Formato esperado: https://<id>.supabase.co/storage/v1/object/public/<bucket>/<path>
        const bucketPath = `/storage/v1/object/public/${bucket}/`;
        if (url.includes(bucketPath)) {
            return decodeURIComponent(url.split(bucketPath)[1]);
        }
        return null;
    };

    try {
        // 1. Actualizar título y descripción
        await supabase.from('encuestas').update({ titulo: poll.titulo, descripcion: poll.descripcion }).eq('id_encuesta', pollId).throwOnError();
        // --- AÑADE ESTA LÓGICA PARA GUARDAR LOS JUECES ---
      if (isProjects) {
        const originalIds = new Set(originalAssignedJudgesRef.current.map(j => j.id_juez));
        const currentIds = new Set(assignedJudges.map(j => j.id_juez));
        
        const judgesToAdd = assignedJudges.filter(j => !originalIds.has(j.id_juez));
        const judgesToRemove = originalAssignedJudgesRef.current.filter(j => !currentIds.has(j.id_juez));

        // Eliminar asignaciones que ya no están
        if (judgesToRemove.length > 0) {
            const idsToRemove = judgesToRemove.map(j => j.id_juez);
            await supabase.from('encuesta_jueces').delete().eq('id_encuesta', pollId).in('id_juez', idsToRemove).throwOnError();
        }

        // Agregar nuevas asignaciones
        if (judgesToAdd.length > 0) {
            const newAssignments = judgesToAdd.map(j => ({
                id_encuesta: pollId,
                id_juez: j.id_juez,
                codigo_acceso_juez: `JUEZ-${pollId}-${j.id_juez}-${crypto.randomUUID().slice(0, 8)}`
            }));
            await supabase.from('encuesta_jueces').insert(newAssignments).throwOnError();
        }

        // Actualizar la referencia original para la próxima vez que se guarde
        originalAssignedJudgesRef.current = [...assignedJudges];
      }
        // 2. Procesar preguntas (Insertar, Actualizar y preparar eliminaciones de imágenes)
        const updatedQuestions = await Promise.all(questions.map(async (q, qi) => {
            let questionImageUrl = q.url_imagen;
            const originalQuestion = originalRef.current.find(oq => oq.id_pregunta === q.id_pregunta);

            // A. Manejar subida de nueva imagen de pregunta
            if (q.imageFile) {
                const bucket = isProjects ? 'imagenes_proyectos' : 'imagenes_candidatos';
                const safeName = q.imageFile.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
                const filePath = `${session.user.id}/${pollId}-${Date.now()}-${qi}-${safeName}`;
                
                const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, q.imageFile);
                if (uploadError) throw uploadError;
                const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
                questionImageUrl = urlData.publicUrl;

                // Si había una imagen antes, marcar la vieja para borrar
                if (originalQuestion?.url_imagen) {
                    const oldPath = extractPath(originalQuestion.url_imagen, bucket);
                    if (oldPath) (filesToDelete as any)[bucket].push(oldPath);
                }
            }
            // B. Manejar eliminación de imagen de pregunta (sin reemplazar)
            else if (!q.url_imagen && originalQuestion?.url_imagen) {
                 const bucket = isProjects ? 'imagenes_proyectos' : 'imagenes_candidatos';
                 const oldPath = extractPath(originalQuestion.url_imagen, bucket);
                 if (oldPath) (filesToDelete as any)[bucket].push(oldPath);
            }
            
            // C. Insertar o Actualizar la pregunta en la BD
            let questionId = q.id_pregunta;
            if (questionId) {
                await supabase.from('preguntas_encuesta').update({ texto_pregunta: q.texto_pregunta, url_imagen: questionImageUrl }).eq('id_pregunta', questionId).throwOnError();
            } else {
                const { data: newQ } = await supabase.from('preguntas_encuesta').insert({
                    id_encuesta: pollId, id_tipo_votacion: poll.id_tipo_votacion,
                    texto_pregunta: q.texto_pregunta, url_imagen: questionImageUrl
                }).select('id_pregunta').single().throwOnError();
                questionId = newQ.id_pregunta;
            }

            // D. Procesar opciones de la pregunta
            const updatedOptions = await Promise.all(q.opciones.map(async (opt, oi) => {
                let optionImageUrl = opt.url_imagen;
                const originalOption = originalQuestion?.opciones.find(oo => oo.id_opcion === opt.id_opcion);

                if (opt.imageFile) {
                    const safeName = opt.imageFile.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
                    const filePath = `${session.user.id}/${pollId}-${Date.now()}-${qi}-${oi}-${safeName}`;
                    const { error: uploadError } = await supabase.storage.from('imagenes_candidatos').upload(filePath, opt.imageFile);
                    if (uploadError) throw uploadError;
                    const { data: urlData } = supabase.storage.from('imagenes_candidatos').getPublicUrl(filePath);
                    optionImageUrl = urlData.publicUrl;
                    if (originalOption?.url_imagen) {
                         const oldPath = extractPath(originalOption.url_imagen, 'imagenes_candidatos');
                         if(oldPath) filesToDelete.imagenes_candidatos.push(oldPath);
                    }
                } else if (!opt.url_imagen && originalOption?.url_imagen) {
                    const oldPath = extractPath(originalOption.url_imagen, 'imagenes_candidatos');
                    if(oldPath) filesToDelete.imagenes_candidatos.push(oldPath);
                }

                if (opt.id_opcion) {
                    await supabase.from('opciones_pregunta').update({ texto_opcion: opt.texto_opcion, url_imagen: optionImageUrl }).eq('id_opcion', opt.id_opcion).throwOnError();
                } else {
                    await supabase.from('opciones_pregunta').insert({ id_pregunta: questionId!, texto_opcion: opt.texto_opcion, url_imagen: optionImageUrl }).throwOnError();
                }
                return { ...opt, url_imagen: optionImageUrl };
            }));

            // Identificar y eliminar opciones borradas de la UI
            const currentOptionIds = q.opciones.map(opt => opt.id_opcion).filter(Boolean);
            const optionsToDelete = (originalQuestion?.opciones || []).filter(opt => opt.id_opcion && !currentOptionIds.includes(opt.id_opcion));
            for (const optToDel of optionsToDelete) {
                if (optToDel.url_imagen) {
                    const oldPath = extractPath(optToDel.url_imagen, 'imagenes_candidatos');
                    if(oldPath) filesToDelete.imagenes_candidatos.push(oldPath);
                }
            }
            if (optionsToDelete.length > 0) {
                 await supabase.from('opciones_pregunta').delete().in('id_opcion', optionsToDelete.map(o => o.id_opcion!)).throwOnError();
            }
            return { ...q, id_pregunta: questionId, opciones: updatedOptions };
        }));

        // 3. Procesar preguntas borradas de la UI
        const currentQuestionIds = updatedQuestions.map(q => q.id_pregunta);
        const questionsToDelete = originalRef.current.filter(q => q.id_pregunta && !currentQuestionIds.includes(q.id_pregunta));
        for (const qToDel of questionsToDelete) {
             if (qToDel.url_imagen) {
                 const bucket = isProjects ? 'imagenes_proyectos' : 'imagenes_candidatos';
                 const oldPath = extractPath(qToDel.url_imagen, bucket);
                 if (oldPath) (filesToDelete as any)[bucket].push(oldPath);
             }
             for (const optToDel of qToDel.opciones) {
                 if (optToDel.url_imagen) {
                    const oldPath = extractPath(optToDel.url_imagen, 'imagenes_candidatos');
                    if(oldPath) filesToDelete.imagenes_candidatos.push(oldPath);
                 }
             }
        }
        if (questionsToDelete.length > 0) {
            await supabase.from('preguntas_encuesta').delete().in('id_pregunta', questionsToDelete.map(q => q.id_pregunta!)).throwOnError();
        }

        // 4. Eliminar todos los archivos de Storage marcados
        if (filesToDelete.imagenes_proyectos.length > 0) {
            await supabase.storage.from('imagenes_proyectos').remove(filesToDelete.imagenes_proyectos);
        }
        if (filesToDelete.imagenes_candidatos.length > 0) {
            await supabase.storage.from('imagenes_candidatos').remove(filesToDelete.imagenes_candidatos);
        }

        Swal.fire('¡Éxito!', 'Se guardaron los cambios.', 'success').then(() => {
            router.push(`/dashboard/polls/${pollId}`); // Volver a la página de detalles
        });

    } catch (err: any) {
        console.error("Error al guardar:", err);
        Swal.fire('Error', err.message, 'error');
    } finally {
        setSaving(false);
    }
  };
    const handleRemoveJudge = (judgeId: number) => {
    setAssignedJudges(current => current.filter(j => j.id_juez !== judgeId));
  };

  const handleAddJudge = () => {
    const select = document.getElementById('judge-select') as HTMLSelectElement;
    if (select.value) {
      const judgeIdToAdd = Number(select.value);
      const judgeToAdd = allJudges.find(j => j.id_juez === judgeIdToAdd);
      if (judgeToAdd && !assignedJudges.some(j => j.id_juez === judgeIdToAdd)) {
        setAssignedJudges(current => [...current, judgeToAdd]);
        select.value = ""; // Resetea el dropdown
      }
    }
  };
  // --- MANIPULACIÓN DE LA UI ---
  const handleQuestionTextChange = (qi: number, value: string) => {
    setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, texto_pregunta: value } : q));
  };
  const handleOptionTextChange = (qi: number, oi: number, value: string) => {
    setQuestions(qs => qs.map((q, i) => i === qi ? {
        ...q, opciones: q.opciones.map((o, j) => j === oi ? { ...o, texto_opcion: value } : o)
    } : q));
  };
  const handleQuestionImageChange = (qi: number, file: File) => {
    handleImageChange(file, (compressedFile, previewUrl) => {
        setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, imageFile: compressedFile, previewUrl, url_imagen: '' } : q));
    });
  };
  const handleOptionImageChange = (qi: number, oi: number, file: File) => {
    handleImageChange(file, (compressedFile, previewUrl) => {
        setQuestions(qs => qs.map((q, i) => i === qi ? {
            ...q, opciones: q.opciones.map((o, j) => j === oi ? { ...o, imageFile: compressedFile, previewUrl, url_imagen: '' } : o)
        } : q));
    });
  };
  const removeQuestion = (qi: number) => setQuestions(qs => qs.filter((_, i) => i !== qi));
  const removeOption = (qi: number, oi: number) => setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, opciones: q.opciones.filter((_, j) => j !== oi) } : q));
  const addQuestion = () => setQuestions(qs => [...qs, { texto_pregunta: '', url_imagen: null, opciones: [{ texto_opcion: '', url_imagen: null }] }]);
  const addOption = (qi: number) => setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, opciones: [...q.opciones, { texto_opcion: '', url_imagen: null }] } : q));

  if (loading) return <p className={styles.info}>🔄 Cargando…</p>
  if (error) return <p className={styles.error}>Error: {error}</p>
  if (!poll) return null

  // --- RENDERIZADO DEL FORMULARIO ---
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>← Regresar</button>
        <h1 className={styles.title}>Editar Encuesta</h1>
      </div>

      <form onSubmit={handleSave} className={styles.form}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Título</label>
          <input value={poll.titulo} onChange={e => setPoll(p => p && ({ ...p, titulo: e.target.value }))} className={styles.input} required />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Descripción</label>
          <textarea value={poll.descripcion || ''} onChange={e => setPoll(p => p && ({ ...p, descripcion: e.target.value }))} className={styles.textarea} rows={3} />
        </div>
        {/* --- AÑADE TODA ESTA NUEVA SECCIÓN PARA GESTIONAR JUECES --- */}
        {isProjects && (
          <fieldset className={styles.judgeManagementSection}>
            <legend className={styles.legend}>Jueces Asignados</legend>
            <div className={styles.assignedJudgesGrid}>
              {assignedJudges.map(judge => (
                <div key={judge.id_juez} className={styles.judgeCard}>
                  {judge.url_imagen && <Image src={judge.url_imagen} alt={judge.nombre_completo} width={40} height={40} className={styles.judgeAvatar} />}
                  <span>{judge.nombre_completo}</span>
                  <button type="button" onClick={() => handleRemoveJudge(judge.id_juez)} className={styles.removeJudgeBtn}>
                    <X size={16} />
                  </button>
                </div>
              ))}
              {assignedJudges.length === 0 && <p className={styles.noJudgesText}>Aún no hay jueces asignados.</p>}
            </div>

            <div className={styles.addJudgeForm}>
              <select id="judge-select" className={styles.select} defaultValue="">
                <option value="" disabled>Selecciona un juez para agregar...</option>
                {allJudges
                  .filter(judge => !assignedJudges.some(assigned => assigned.id_juez === judge.id_juez))
                  .map(judge => (
                    <option key={judge.id_juez} value={judge.id_juez}>{judge.nombre_completo}</option>
                  ))
                }
              </select>
              <button type="button" onClick={handleAddJudge} className={styles.addBtn}>
                <UserPlus size={18} /> Agregar Juez
              </button>
            </div>
          </fieldset>
        )}
        {questions.map((q, qi) => (
          <fieldset key={q.id_pregunta || `new-${qi}`} className={styles.questionBlock}>
            <legend className={styles.legend}>
                {isProjects ? `Proyecto #${qi + 1}` : (isCandidates ? 'Candidatas' : `Pregunta #${qi + 1}`)}
                {(!isCandidates || questions.length > 1) && 
                    <button type="button" onClick={() => removeQuestion(qi)} className={styles.removeBtn}>×</button>
                }
            </legend>
            <div className={styles.formGroup}>
              <input value={q.texto_pregunta} onChange={e => handleQuestionTextChange(qi, e.target.value)} className={styles.input} placeholder={isProjects ? "Nombre del Proyecto" : "Texto de la pregunta"} required />
            </div>
            
            {(isProjects) && (
              <div className={styles.imageUploadGroup}>
                <ImageUploader 
                    imageUrl={q.previewUrl || q.url_imagen}
                    onImageChange={(file) => handleQuestionImageChange(qi, file)}
                    onImageRemove={() => setQuestions(qs => qs.map((q, i) => i === qi ? {...q, url_imagen: null, imageFile: null, previewUrl: null} : q))}
                />
              </div>
            )}

            {isCandidates && (
                <div className={styles.optionsSection}>
                    <label className={styles.label}>Opciones</label>
                    {q.opciones.map((opt, oi) => (
                        <div key={opt.id_opcion || `new-opt-${oi}`} className={styles.optionRow}>
                            <input value={opt.texto_opcion} onChange={e => handleOptionTextChange(qi, oi, e.target.value)} className={styles.input} placeholder={`Candidata #${oi + 1}`} required />
                            <ImageUploader 
                                imageUrl={opt.previewUrl || opt.url_imagen}
                                onImageChange={(file) => handleOptionImageChange(qi, oi, file)}
                                onImageRemove={() => setQuestions(qs => qs.map((q, i) => i === qi ? {...q, opciones: q.opciones.map((o, j) => j === oi ? {...o, url_imagen: null, imageFile: null, previewUrl: null} : o)} : q))}
                            />
                            <button type="button" onClick={() => removeOption(qi, oi)} className={styles.removeBtn}>×</button>
                        </div>
                    ))}
                    <button type="button" onClick={() => addOption(qi)} className={styles.addBtn}>+ Agregar Candidata</button>
                </div>
            )}
          </fieldset>
        ))}
        
        {isProjects && <button type="button" onClick={addQuestion} className={styles.addQuestionBtn}>+ Agregar Proyecto</button>}
        
        <button type="submit" className={styles.submitBtn} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar Cambios'}
        </button>
      </form>
    </div>
  )
}

// Componente auxiliar para subir imágenes
function ImageUploader({ imageUrl, onImageChange, onImageRemove }: {
    imageUrl: string | null | undefined;
    onImageChange: (file: File) => void;
    onImageRemove: () => void;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <div className={styles.imageUploadGroup}>
            {imageUrl ? (
                <div className={styles.imagePreviewContainer}>
                    <Image src={imageUrl} alt="Preview" width={80} height={80} className={styles.previewImg} onClick={() => fileInputRef.current?.click()} />
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onImageChange(e.target.files[0])} style={{ display: 'none' }} />
                    <button type="button" onClick={onImageRemove} className={styles.removeImageBtn}>×</button>
                </div>
            ) : (
                <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onImageChange(e.target.files[0])} className={styles.fileInput} />
            )}
        </div>
    );
}