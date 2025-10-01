'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '../../../../lib/supabaseClient'
import imageCompression from 'browser-image-compression'
import { Eye, PlusCircle, Trash2 } from 'lucide-react'
import Swal from 'sweetalert2'
import styles from './page.module.css'
import { Session } from '@supabase/supabase-js'

// --- INTERFACES ---

interface Project {
  id: number;
  name: string;
  imageFile: File | null;
  previewUrl: string | null;
}

interface Option {
  id: number;
  name: string;
  imageFile: File | null;
  previewUrl: string | null;
}

interface Question {
  id: number;
  text: string;
  options: Option[];
}

interface Judge {
  id_juez: number;
  nombre_completo: string;
  url_imagen: string | null;
  codigo_unico: string; // <-- Campo añadido
}

interface NewJudge {
    name: string;
    imageFile: File | null;
    previewUrl: string | null;
}

const getInitial = (name: string): string => {
    if (!name) return '?';
    const titles = /^(Dr|Dra|Ing|Lic)\.?$/i;
    const parts = name.split(' ');
    const significantPart = parts.find(part => !titles.test(part));
    return (significantPart || parts[0]).charAt(0).toUpperCase();
};


export default function CreatePollFormPage() {
  const { typeId } = useParams<{ typeId: string }>()
  const router = useRouter()

  const [session, setSession] = useState<Session | null>(null);
  const [typeName, setTypeName] = useState('')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [preview, setPreview] = useState(false)

  const [duracionSegundos, setDuracionSegundos] = useState(60);
  const [projects, setProjects] = useState<Project[]>([{ id: Date.now(), name: '', imageFile: null, previewUrl: null }])
  const [candidateQuestions, setCandidateQuestions] = useState<Question[]>([
    { id: Date.now(), text: '', options: [{ id: Date.now() + 1, name: '', imageFile: null, previewUrl: null }] }
  ]);
  
  const [availableJudges, setAvailableJudges] = useState<Judge[]>([]);
  const [selectedJudges, setSelectedJudges] = useState<Set<number>>(new Set());
  const [newJudge, setNewJudge] = useState<NewJudge>({ name: '', imageFile: null, previewUrl: null });

  const isProjects = typeName === 'Proyectos';
  const isCandidates = typeName === 'Candidatas';

  useEffect(() => {
    const loadInitialData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      if (!typeId) return;
      const { data: typeData } = await supabase.from('tipos_votacion').select('nombre').eq('id_tipo_votacion', Number(typeId)).single();
      if (typeData?.nombre) {
        setTypeName(typeData.nombre);
        if (typeData.nombre === 'Proyectos' && session?.user.id) {
          const { data: judgesData, error: judgesError } = await supabase.from('jueces').select('*').eq('id_usuario_creador', session.user.id);
          if (judgesError) console.error("Error al cargar jueces:", judgesError);
          else setAvailableJudges(judgesData || []);
        }
      }
    };
    loadInitialData();
  }, [typeId]);


   const compressAndPreviewImage = async (file: File, callback: (file: File, url: string) => void) => {
    if (!file) return;
     Swal.fire({ title: 'Procesando imagen...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
     try {
      const options = { 
         maxSizeMB: 5, // <--- CAMBIO CLAVE: Aumentamos drásticamente el límite (a 5MB) para prácticamente NO forzar la compresión por tamaño.
         maxWidthOrHeight: 1200, // <--- RECOMENDACIÓN: Subimos a 1200px para mantener mejor detalle si se ven en grande.
        useWebWorker: true,
        fileType: "image/jpeg", // <--- OPCIONAL: Forzamos la salida a JPEG
         initialQuality: 0.95, // <--- CLAVE: Establece una calidad JPEG muy alta (95%)
    };

     // Si la imagen ya es pequeña, la omite. Si es grande, reduce su resolución y la convierte a JPEG de alta calidad.
       const compressedFile = await imageCompression(file, options);
      const previewUrl = URL.createObjectURL(compressedFile);
      callback(compressedFile, previewUrl);
       Swal.close();
     } catch (error) {
    console.error('Error al procesar:', error);
     Swal.fire('Error', 'No se pudo procesar la imagen.', 'error');
    }
   };

  const handleProjectImageChange = (file: File, projectId: number) => {
    compressAndPreviewImage(file, (compressedFile, previewUrl) => {
      setProjects(ps => ps.map(p => p.id === projectId ? { ...p, imageFile: compressedFile, previewUrl } : p));
    });
  };

  const handleNewJudgeImageChange = (file: File) => {
    compressAndPreviewImage(file, (compressedFile, previewUrl) => {
      setNewJudge(j => ({ ...j, imageFile: compressedFile, previewUrl }));
    });
  };

  // --- LÓGICA DE AÑADIR JUEZ ACTUALIZADA ---
  const handleAddJudge = async () => {
    if (!newJudge.name.trim() || !session?.user.id) {
      Swal.fire('Atención', 'El nombre del juez no puede estar vacío.', 'warning');
      return;
    }
    let imageUrl: string | null = null;
    if (newJudge.imageFile) {
        const safeName = newJudge.imageFile.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
        const filePath = `${session.user.id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('fotos_jueces').upload(filePath, newJudge.imageFile);
        if (uploadError) {
            Swal.fire('Error de Subida', uploadError.message, 'error');
            return;
        }
        const { data: urlData } = supabase.storage.from('fotos_jueces').getPublicUrl(filePath);
        imageUrl = urlData.publicUrl;
    }
    
    // Genera un código único para el nuevo juez
    const uniqueCode = `JUEZ-${Date.now().toString().slice(-4)}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const { data, error } = await supabase.from('jueces').insert({
      nombre_completo: newJudge.name.trim(),
      id_usuario_creador: session.user.id,
      url_imagen: imageUrl,
      codigo_unico: uniqueCode, // <-- Guarda el código único
    }).select().single();

    if (error) {
      Swal.fire('Error', `No se pudo agregar al juez: ${error.message}`, 'error');
    } else if (data) {
      setAvailableJudges(current => [...current, data]);
      setNewJudge({ name: '', imageFile: null, previewUrl: null });
      Swal.fire('Juez Agregado', `El código único para ${data.nombre_completo} es: ${data.codigo_unico}`, 'success');
    }
  };

  const handleToggleJudgeSelection = (judgeId: number) => {
    setSelectedJudges(prev => {
      const newSet = new Set(prev);
      newSet.has(judgeId) ? newSet.delete(judgeId) : newSet.add(judgeId);
      return newSet;
    });
  };

  const validateForm = () => {
    if (!titulo.trim()) {
      Swal.fire('Campo Requerido', 'El título de la encuesta no puede estar vacío.', 'warning');
      return false;
    }
    return true;
  };

  const handlePreview = () => {
    if (validateForm()) {
      setPreview(true);
    }
  };

  // --- FUNCIÓN DE ENVÍO PRINCIPAL ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (!session?.user.id) {
        Swal.fire('Error', 'No se ha iniciado sesión.', 'error');
        return router.replace('/auth/login');
    }

    Swal.fire({ title: 'Creando encuesta...', text: 'Por favor, espera.', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        if (isProjects) {
            const projectsWithUrls = await Promise.all(
                projects.map(async (project) => {
                    let imageUrl: string | null = null;
                    if (project.imageFile) {
                        const safeName = project.imageFile.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
                        const filePath = `${session.user.id}/${Date.now()}-${safeName}`;
                        const { error: uploadError } = await supabase.storage.from('imagenes_proyectos').upload(filePath, project.imageFile);
                        if (uploadError) throw new Error(`Error al subir imagen del proyecto: ${uploadError.message}`);
                        
                        const { data: urlData } = supabase.storage.from('imagenes_proyectos').getPublicUrl(filePath);
                        imageUrl = urlData.publicUrl;
                    }
                    return { name: project.name, imageUrl: imageUrl };
                })
            );

            const args = {
                titulo: titulo.trim(),
                descripcion: descripcion.trim(),
                duracion_segundos: duracionSegundos,
                id_usuario_creador: session.user.id,
                id_tipo_votacion_param: Number(typeId),
                proyectos: projectsWithUrls,
                jueces: Array.from(selectedJudges)
            };

            const { data: pollId, error } = await supabase.rpc('crear_encuesta_proyectos', args);
            if (error) throw error;
            
            Swal.fire({ icon: 'success', title: '¡Encuesta Creada!', timer: 2000, showConfirmButton: false })
                .then(() => router.push(`/dashboard/polls/${pollId}`));

        } else if (isCandidates) {
            const code = `${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
            const url = `${window.location.origin}/vote/${code}`;

            const { data: enc, error: encErr } = await supabase.from('encuestas').insert({
                titulo: titulo.trim(),
                descripcion: descripcion.trim(),
                id_tipo_votacion: Number(typeId),
                id_usuario_creador: session.user.id,
                codigo_acceso: code,
                url_votacion: url,
            }).select('id_encuesta').single();

            if (encErr || !enc) throw encErr || new Error('No se pudo crear la encuesta.');
            const pollId = enc.id_encuesta;

            for (const question of candidateQuestions) {
                if (!question.text.trim()) continue;

                const { data: pq, error: pqErr } = await supabase.from('preguntas_encuesta').insert({
                    id_encuesta: pollId, 
                    id_tipo_votacion: Number(typeId), 
                    texto_pregunta: question.text.trim(),
                }).select('id_pregunta').single();
                
                if (pqErr || !pq) throw pqErr;
                const questionId = pq.id_pregunta;

                const candidateOptions = await Promise.all(
                    question.options.filter(c => c.name.trim()).map(async (candidate) => {
                        let imageUrl: string | null = null;
                        if (candidate.imageFile) {
                            const safeName = candidate.imageFile.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
                            const filePath = `${session.user.id}/${pollId}/${questionId}-${safeName}`;
                            const { error: uploadError } = await supabase.storage.from('imagenes_candidatos').upload(filePath, candidate.imageFile);
                            
                            if (uploadError) {
                                console.error("Error subiendo imagen de candidato: ", uploadError.message);
                            } else {
                                const { data: urlData } = supabase.storage.from('imagenes_candidatos').getPublicUrl(filePath);
                                imageUrl = urlData.publicUrl;
                            }
                        }
                        return {
                            id_pregunta: questionId,
                            texto_opcion: candidate.name.trim(),
                            url_imagen: imageUrl
                        };
                    })
                );

                if(candidateOptions.length > 0) {
                    const { error: optsErr } = await supabase.from('opciones_pregunta').insert(candidateOptions);
                    if (optsErr) throw optsErr;
                }
            }

            Swal.fire({ icon: 'success', title: '¡Encuesta Creada!', timer: 2000, showConfirmButton: false })
               .then(() => router.push(`/dashboard/polls/${pollId}`));
        }

    } catch (err: any) {
        Swal.fire({ icon: 'error', title: 'Error en el proceso', text: err.message });
    }
  };

  // --- VISTA PREVIA ---
  if (preview) {
    return (
      <div className={styles.container}>
        <div className={styles.headerContainer}>
          <button onClick={() => setPreview(false)} className={styles.backButton}>←</button>
          <h1 className={styles.heading}>Previsualización</h1>
        </div>
        
        <h2 className={styles.previewPollTitle}>{titulo}</h2>
        {descripcion && <p className={styles.description}>{descripcion}</p>}
        
        <form className={styles.form}>
          {isCandidates && candidateQuestions.map(q => (
            <fieldset key={q.id} className={styles.fieldset}>
              <legend>{q.text || 'Pregunta'}</legend>
              <div className={styles.optionsContainer}>
                {q.options.map((opt) => (
                  <label key={opt.id} className={styles.optionItem}>
                    <input type="radio" name={`preview_q_${q.id}`} disabled />
                    {opt.previewUrl && <Image src={opt.previewUrl} alt={opt.name || 'Imagen'} width={40} height={40} className={styles.optionImg} />}
                    <span>{opt.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          {isProjects && projects.map((p) => (
             <fieldset key={p.id} className={styles.fieldset}>
               <legend>{p.name}</legend>
               {p.previewUrl && <Image src={p.previewUrl} alt={p.name || 'Imagen'} width={100} height={100} className={styles.previewImg}/>}
                <div className={styles.scoringItem}>
                    <span className={styles.scoringOptionLabel}>Puntuación</span>
                    <div className={styles.sliderGroup}>
                        <input type="range" min={0} max={10} step={0.1} defaultValue={5} disabled className={styles.sliderInput} />
                        <span className={styles.sliderValue}>5.0</span>
                    </div>
                </div>
             </fieldset>
          ))}
          <button type="button" disabled className={styles.submitBtn}>
            Enviar voto (simulado)
          </button>
        </form>
      </div>
    )
  }

  // --- FORMULARIO PRINCIPAL ---
  return (
    <div className={styles.container}>
      <div className={styles.headerContainer}>
        <button onClick={() => router.back()} className={styles.backButton}>←</button>
        <h1 className={styles.heading}>Crear encuesta: {typeName}</h1>
      </div>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label>Título</label>
          <input className={styles.input} value={titulo} onChange={e => setTitulo(e.target.value)} required />
        </div>
        <div className={styles.field}>
          <label>Descripción</label>
          <textarea className={styles.textarea} value={descripcion} onChange={e => setDescripcion(e.target.value)} />
        </div>
        
        {isProjects && (
            <>
                <div className={styles.field}>
                    <label>Duración de la Votación (en segundos)</label>
                    <input type="number" className={styles.input} value={duracionSegundos} onChange={e => setDuracionSegundos(parseInt(e.target.value, 10) || 0)} required min="1" />
                </div>
                <fieldset className={styles.card}>
                    <legend>Proyecto a Evaluar</legend>
                    {projects.map((p, i) => (
                        <div key={p.id} className={styles.projectItem}>
                            <input className={styles.input} placeholder={`Estudiante que realizo el Proyecto`} value={p.name}
                                onChange={e => setProjects(ps => ps.map(proj => proj.id === p.id ? {...proj, name: e.target.value} : proj))}
                                required
                            />
                            <input type="file" accept="image/*" className={styles.fileInput}
                                onChange={(e) => e.target.files?.[0] && handleProjectImageChange(e.target.files[0], p.id)}
                            />
                            {p.previewUrl && <Image src={p.previewUrl} alt="Vista previa" width={50} height={50} style={{objectFit: 'cover', borderRadius: '8px'}}/>}
                            {projects.length > 1 && <button type="button" onClick={() => setProjects(ps => ps.filter(proj => proj.id !== p.id))} className={styles.removeBtnMini}><Trash2 size={16}/></button>}
                        </div>
                    ))}
                </fieldset>

                <fieldset className={styles.card}>
                    <legend>Terna Calificadora</legend>
                    <p className={styles.subtleLabel}>Selecciona los jueces que participarán:</p>
                    <div className={styles.judgesGrid}>
                        {availableJudges.map((j) => (
                            <div key={j.id_juez} className={`${styles.judgeCard} ${selectedJudges.has(j.id_juez) ? styles.selected : ''}`} onClick={() => handleToggleJudgeSelection(j.id_juez)}>
                                <input type="checkbox" checked={selectedJudges.has(j.id_juez)} readOnly className={styles.checkbox}/>
                                {j.url_imagen ? 
                                    <Image src={j.url_imagen} alt={j.nombre_completo} width={40} height={40} className={styles.judgeImage}/> :
                                    <div className={styles.judgeAvatar}>{getInitial(j.nombre_completo)}</div>
                                }
                                <span>{j.nombre_completo}</span>
                            </div>
                        ))}
                    </div>
                    <div className={styles.addJudgeSection}>
                        <p className={styles.subtleLabel}>O agrega un nuevo juez:</p>
                        <div className={styles.optionRow}>
                            <input className={styles.input} placeholder="Nombre completo del nuevo juez" value={newJudge.name} onChange={e => setNewJudge(j => ({...j, name: e.target.value}))} />
                            <input type="file" accept="image/*" className={styles.fileInput} onChange={(e) => e.target.files?.[0] && handleNewJudgeImageChange(e.target.files[0])}/>
                            {newJudge.previewUrl && <Image src={newJudge.previewUrl} alt="preview" width={40} height={40} className={styles.judgeImage}/>}
                            <button type="button" onClick={handleAddJudge} className={styles.button}><PlusCircle size={16}/> Guardar Juez</button>
                        </div>
                    </div>
                </fieldset>
            </>
        )}

        {isCandidates && (
          <>
            {candidateQuestions.map((q, qi) => (
              <fieldset key={q.id} className={styles.card}>
                <legend>
                  Pregunta #{qi + 1}
                  {candidateQuestions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setCandidateQuestions(qs => qs.filter(question => question.id !== q.id))}
                      className={styles.removeBtnMini}
                      style={{ marginLeft: '1rem' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </legend>
                
                <input
                  className={styles.input}
                  placeholder={`Texto de la Pregunta #${qi + 1}`}
                  value={q.text}
                  onChange={(e) => {
                    const newText = e.target.value;
                    setCandidateQuestions(qs => qs.map(question => 
                      question.id === q.id ? { ...question, text: newText } : question
                    ));
                  }}
                  required
                />
                
                <hr style={{border: 'none', borderTop: '1px solid #eee', margin: '1rem 0'}} />

                {q.options.map((opt, oi) => (
                  <div key={opt.id} className={styles.projectItem}>
                    <input
                      className={styles.input}
                      placeholder={`Nombre Candidata #${oi + 1}`}
                      value={opt.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setCandidateQuestions(qs => qs.map(question => 
                          question.id === q.id 
                          ? { ...question, options: question.options.map(option => option.id === opt.id ? { ...option, name: newName } : option) } 
                          : question
                        ));
                      }}
                      required
                    />
                    <input
                      type="file"
                      accept="image/*"
                      className={styles.fileInput}
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          const file = e.target.files[0];
                          compressAndPreviewImage(file, (compressedFile, previewUrl) => {
                            setCandidateQuestions(qs => qs.map(question => 
                              question.id === q.id 
                              ? { ...question, options: question.options.map(option => option.id === opt.id ? { ...option, imageFile: compressedFile, previewUrl } : option) } 
                              : question
                            ));
                          });
                        }
                      }}
                    />
                    {opt.previewUrl && <Image src={opt.previewUrl} alt="Vista previa" width={50} height={50} style={{ objectFit: 'cover', borderRadius: '8px' }} />}
                    {q.options.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setCandidateQuestions(qs => qs.map(question => 
                            question.id === q.id 
                            ? { ...question, options: question.options.filter(option => option.id !== opt.id) } 
                            : question
                          ));
                        }}
                        className={styles.removeBtnMini}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    const newOption = { id: Date.now(), name: '', imageFile: null, previewUrl: null };
                    setCandidateQuestions(qs => qs.map(question => 
                      question.id === q.id 
                      ? { ...question, options: [...question.options, newOption] } 
                      : question
                    ));
                  }}
                  className={styles.button}
                >
                  <PlusCircle size={16} /> Agregar Candidata
                </button>
              </fieldset>
            ))}
            
            <button
              type="button"
              onClick={() => {
                const newQuestion = { id: Date.now(), text: '', options: [{ id: Date.now() + 1, name: '', imageFile: null, previewUrl: null }] };
                setCandidateQuestions(qs => [...qs, newQuestion]);
              }}
              className={styles.button}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <PlusCircle size={16} /> Agregar Pregunta
            </button>
          </>
        )}
        
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

