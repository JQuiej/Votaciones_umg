'use client'

import React, { useState, useEffect } from 'react'; // Importamos useEffect
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabaseClient'; // Asegúrate que la ruta sea correcta
import Swal from 'sweetalert2';
import styles from './update.module.css';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // NUEVO: Estado para saber si el usuario tiene una sesión de recuperación válida
  const [isRecoverySession, setIsRecoverySession] = useState(false);

  // --- INICIO DE LA CORRECCIÓN ---
  // NUEVO: useEffect para manejar el evento de recuperación de contraseña.
  useEffect(() => {
    // onAuthStateChange se dispara cuando el usuario llega a esta página
    // desde el enlace del email, porque la URL contiene el token.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Este evento confirma que el usuario ha llegado desde un enlace válido.
        // Supabase ha establecido una sesión temporal.
        setIsRecoverySession(true);
      }
    });

    // Es muy importante cancelar la suscripción cuando el componente se desmonte
    // para evitar fugas de memoria.
    return () => {
      subscription.unsubscribe();
    };
  }, []);
  // --- FIN DE LA CORRECCIÓN ---

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    // Verificación adicional: el formulario solo debe funcionar si hay una sesión de recuperación.
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

    // Ahora esta llamada funcionará porque el useEffect ya estableció la sesión temporal.
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
      // Es mejor redirigir a la página de login para que el usuario inicie sesión con su nueva contraseña.
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