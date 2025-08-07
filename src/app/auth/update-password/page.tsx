'use client'

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabaseClient';
import Swal from 'sweetalert2';
import styles from './update.module.css';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecoverySession, setIsRecoverySession] = useState(false);

  useEffect(() => {
    // --- INICIO DE LA MEJORA ---
    // Revisa si la URL contiene un error cuando la página carga.
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1)); // Quita el '#' inicial
      const errorCode = params.get('error_code');
      const errorDescription = params.get('error_description');

      if (errorCode === 'otp_expired') {
        Swal.fire({
          icon: 'error',
          title: 'Enlace Expirado',
          text: 'El enlace para restablecer la contraseña ha expirado o ya no es válido. Por favor, solicita uno nuevo.',
          confirmButtonText: 'Entendido'
        });
        // Como hay un error, no continuamos con la lógica de recuperación.
        return; 
      }
    }
    // --- FIN DE LA MEJORA ---

    // Esta parte solo se ejecutará si no hay un error en la URL.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoverySession(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isRecoverySession) {
        Swal.fire('Token no válido', 'Para restablecer tu contraseña, por favor usa el enlace enviado a tu correo electrónico.', 'error');
        return;
    }

    if (!password || !confirmPassword) {
      Swal.fire('Campos incompletos', 'Por favor, introduce y confirma tu nueva contraseña.', 'warning');
      return;
    }
    if (password !== confirmPassword) {
      Swal.fire('Las contraseñas no coinciden', 'Por favor, asegúrate de que ambas contraseñas sean iguales.', 'error');
      return;
    }
    if (password.length < 6) {
        Swal.fire('Contraseña muy corta', 'La contraseña debe tener al menos 6 caracteres.', 'warning');
        return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: password
    });

    setLoading(false);

    if (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error al actualizar',
        text: 'El enlace de recuperación puede haber expirado. Por favor, solicita uno nuevo.',
      });
    } else {
      await Swal.fire({
        icon: 'success',
        title: '¡Contraseña Actualizada!',
        text: 'Tu contraseña ha sido cambiada exitosamente. Ahora serás redirigido para iniciar sesión.',
        timer: 3000,
        showConfirmButton: false,
      });
      router.push('/auth/login');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Actualizar Contraseña</h1>
        <p className={styles.subtitle}>Introduce tu nueva contraseña a continuación.</p>
        <form onSubmit={handleUpdatePassword} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>Nueva Contraseña</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              disabled={loading}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="confirmPassword" className={styles.label}>Confirmar Nueva Contraseña</label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              disabled={loading}
              required
            />
          </div>
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar Contraseña'}
          </button>
        </form>
        <div className={styles.linksContainer}>
          <Link href="/auth/login" className={styles.link}>
            Volver a Iniciar Sesión
          </Link>
        </div>
      </div>
    </div>
  );
}