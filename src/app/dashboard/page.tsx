// src/app/dashboard/page.tsx
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Panel de Usuario</h1>
      <ul>
        <li><Link href="/dashboard/crear_encuesta">Crear encuesta</Link></li>
        <li><Link href="/dashboard/polls">Mis encuestas</Link></li>
        <li><Link href="/dashboard/polls?status=en_progreso">Encuestas en proceso</Link></li>
      </ul>
    </div>
  );
}
