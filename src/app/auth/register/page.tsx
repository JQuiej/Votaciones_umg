// src/app/auth/register/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import Link from 'next/link'; // Importar Link de Next.js
import styles from './register.module.css'; // Importar el archivo CSS del módulo

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); // Nuevo estado para errores

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null); // Limpiar errores previos

    // 1) Creamos el usuario en Auth de Supabase
    const { data, error: authError } =
      await supabase.auth.signUp({ email, password: pass });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const session = data.session;
    const user = data.user;

    // 2) Si el usuario se creó en Auth, guardamos los datos básicos en nuestra tabla 'usuarios'
    // IMPORTANTE: NO GUARDAR LA CONTRASEÑA AQUÍ. Supabase ya la maneja de forma segura.
    if (user) {
      const { error: insertError } = await supabase
        .from('usuarios')
        .insert({
          id_usuario: user.id,
          correo_electronico: email,
          // No guardar la contraseña aquí por seguridad.
          // Si necesitas otros datos de perfil, agrégalos aquí.
        });

      if (insertError) {
        setError('Error al guardar datos de usuario: ' + insertError.message);
        setLoading(false);
        return;
      }
    }

    // 3) Redirección según si tenemos sesión o no (requiere confirmación por email)
    if (session) {
      // Si la sesión se creó directamente (ej. si la confirmación por email está desactivada en Supabase)
      router.push('/dashboard/polls'); // Redirigir al dashboard principal
    } else {
      // Si se requiere confirmación por email
      alert(
        '¡Registro exitoso! Revisa tu correo electrónico para confirmar tu cuenta y luego inicia sesión.'
      );
      router.push('/auth/login');
    }
    setLoading(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Crear Cuenta</h1>
        {error && <p className={styles.errorMessage}>{error}</p>}
        <form onSubmit={handleRegister}>
          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.label}>Email</label>
            <input
              id="email"
              type="email"
              placeholder="tu@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              disabled={loading}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>Contraseña</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className={styles.input}
              disabled={loading}
              required
            />
          </div>
          <button type="submit" className={styles.buttonPrimary} disabled={loading}>
            {loading ? 'Registrando...' : 'Registrar'}
          </button>
        </form>
        <div className={styles.linksContainer}>
          <Link href="/auth/login" className={styles.link}>
            ¿Ya tienes cuenta? Inicia sesión
          </Link>
        </div>
      </div>
    </div>
  );
}