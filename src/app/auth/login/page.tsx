'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import Link from 'next/link'; // Importar Link de Next.js
import styles from './login.module.css'; // Importar el archivo CSS del módulo

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false); // Nuevo estado para controlar la carga
  const [error, setError] = useState<string | null>(null); // Nuevo estado para errores
  const router = useRouter();

  async function handleLogin() {
    setLoading(true);
    setError(null); // Limpiar errores previos
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: pass });
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
    } else {
      router.push('/dashboard/polls'); // Redirigir al dashboard principal después del login
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Iniciar Sesión</h1>
        {error && <p className={styles.errorMessage}>{error}</p>}
        <div className={styles.formGroup}>
          <label htmlFor="email" className={styles.label}>Email</label>
          <input
            id="email"
            className={styles.input}
            placeholder="tu@ejemplo.com"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={loading}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="password" className={styles.label}>Contraseña</label>
          <input
            id="password"
            className={styles.input}
            placeholder="••••••••"
            type="password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            disabled={loading}
            required
          />
        </div>
        <button
          className={styles.buttonPrimary}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? 'Cargando...' : 'Entrar'}
        </button>

        <div className={styles.linksContainer}>
          <Link href="/auth/pass" className={styles.link}>
            ¿Olvidaste tu contraseña?
          </Link>
          <Link href="/auth/register" className={styles.link}>
            ¿No tienes cuenta? Regístrate
          </Link>
        </div>
      </div>
    </div>
  );
}