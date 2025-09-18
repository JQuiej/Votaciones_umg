// src/app/dashboard/realtime/[id]/ChartDisplay.tsx
'use client';

import React from 'react';
import Image from 'next/image';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Legend, CartesianGrid, LabelList
} from 'recharts';
import { Crown } from 'lucide-react';
import styles from './page.module.css';

// --- Interfaces ---
interface ProjectResult {
    id: number; name: string; imageUrl: string | null;
    judgeScores: { name: string; score: number | null; imageUrl: string | null }[];
    publicScore: number; totalScore: number;
}
interface CandidateResult {
    id_pregunta: number; texto_pregunta: string; url_imagen: string | null;
    options: { name: string; count: number; url_imagen?: string | null }[];
}
type ResultData = ProjectResult | CandidateResult;

interface ChartDisplayProps {
    isProjectsPoll: boolean;
    isCandidatesPoll: boolean;
    data: ResultData[];
    view: 'bar' | 'pie';
    COLORS: string[];
    judgeNames: string[];
    setView: (view: 'bar' | 'pie') => void; // Prop para cambiar la vista
}

// Componente para etiquetas personalizadas en las barras
const CustomBarLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (value > 0.5) {
        return (
            <text x={x + width / 2} y={y + 18} fill="#fff" textAnchor="middle" fontSize={12}>
                {value.toFixed(1)}
            </text>
        );
    }
    return null;
};

export default function ChartDisplay({ 
    isProjectsPoll, 
    isCandidatesPoll, 
    data, 
    view, 
    COLORS,
    setView,
    judgeNames 
}: ChartDisplayProps) {
    
    // --- Lógica para Gráfico de Proyectos ---
// --- LÓGICA NUEVA Y CORREGIDA PARA GRÁFICO DE PROYECTOS ---
    if (isProjectsPoll) {
        const projectsData = data as ProjectResult[];

         // --- INICIO DE LA LÓGICA DINÁMICA ---
        const chartData = projectsData.map(project => {
            const projectScores: { [key: string]: any } = {
                name: project.name,
                'Público': project.publicScore || 0,
            };
            // Usamos la lista de nombres que viene de la BD
            judgeNames.forEach(judgeName => {
                const judgeScore = project.judgeScores.find(j => j.name === judgeName);
                projectScores[judgeName] = judgeScore?.score ?? 0;
            });
            return projectScores;
        });

        // Paleta de colores genérica para los jueces
        const judgeColorPalette = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#a4de6c'];

        // Genera los colores dinámicamente
        const contributorColors: Record<string, string> = { 'Público': '#28a745' };
        judgeNames.forEach((name, index) => {
            contributorColors[name] = judgeColorPalette[index % judgeColorPalette.length];
        });
        
        const scoreKeys = Object.keys(chartData[0] || {}).filter(key => key !== 'name');
        // --- FIN DE LA LÓGICA DINÁMICA ---

        return (
            <div className={styles.projectsChartContainer}>
                {projectsData.map((project, projectIndex) => {
                    // 1. Preparamos los datos para ESTE proyecto específico
                    const chartDataForProject = [
                        { name: 'Público', score: project.publicScore || 0 },
                        ...project.judgeScores.map(j => ({
                            name: j.name,
                            score: j.score || 0
                        }))
                    ];

                    // 2. Renderizamos un gráfico individual para CADA proyecto
                    return (
                        <div key={project.id} className={styles.summaryChart}>
                            <h3 className={styles.chartTitle}>{project.name}</h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart
                                    data={chartDataForProject}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" />
                                    {/* Eje X: Los nombres de quienes puntúan (Público, Jueces) */}
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                    {/* Eje Y: La escala de puntuación de 0 a 10 */}
                                    <YAxis type="number" domain={[0, 10]} />
                                    <Tooltip formatter={(value: number) => [`${value.toFixed(2)} pts`, 'Puntuación']} />
                                    <Bar dataKey="score" name="Puntuación">
                                        {/* Usamos <Cell> para dar un color diferente a cada barra */}
                                        {chartDataForProject.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={contributorColors[chartDataForProject[index].name]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    );
                })}
            </div>
        );
    }

    // --- Lógica Corregida para Gráfico de Candidatas ---
    if (isCandidatesPoll) {
        return (
            <div className={styles.candidatesContainer}>

                {/* El bucle ahora solo renderiza los bloques de cada pregunta */}
                {(data as CandidateResult[]).map(q => (
                    <div key={q.id_pregunta} className={styles.chartBlock}>
                        <h3 className={styles.questionTitle}>{q.texto_pregunta}</h3>
                        {q.url_imagen && <Image src={q.url_imagen} alt={q.texto_pregunta} width={150} height={100} className={styles.questionImg} />}
                        
                        {view === 'bar' ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={q.options} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip formatter={(value: number) => `${value} votos`} />
                                    <Bar dataKey="count" name="Votos" fill="#8884d8" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie 
                                        data={q.options} 
                                        dataKey="count" 
                                        nameKey="name" 
                                        cx="50%" 
                                        cy="50%" 
                                        outerRadius={100} 
                                        label={({ name, percent }) => `${name} ${((Number(percent) || 0) * 100).toFixed(0)}%`}
                                    >
                                        {q.options.map((_entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip formatter={(value: number) => `${value} votos`} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        )}

                        <div className={styles.optionList}>
                            {q.options.map((opt, i) => (
                                <div key={i} className={styles.optionItem}>
                                    {opt.url_imagen && (<Image src={opt.url_imagen} alt={opt.name} width={40} height={40} className={styles.optionImg} />)}
                                    <span className={styles.optionText}>{i === 0 && <Crown size={16} style={{ color: '#FFD700', marginRight: '8px' }} />}{opt.name}: <strong>{opt.count} votos</strong></span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return null;
}