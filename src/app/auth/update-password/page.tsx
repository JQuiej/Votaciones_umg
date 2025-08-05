'use client'

import React, { useState } from 'react';
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

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Validación: Comprobar que las contraseñas no estén vacías y coincidan.
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

    // 2. Llamada a Supabase para actualizar la contraseña del usuario logueado.
    const { error } = await supabase.auth.updateUser({
      password: password
    });

    setLoading(false);

    if (error) {
      // 3. Manejo de errores
      Swal.fire({
        icon: 'error',
        title: 'Error al actualizar',
        text: error.message,
      });
    } else {
      // 4. Mensaje de éxito y redirección
      await Swal.fire({
        icon: 'success',
        title: '¡Contraseña Actualizada!',
        text: 'Tu contraseña ha sido cambiada exitosamente.',
        timer: 2000,
        showConfirmButton: false,
      });
      router.push('/dashboard/polls'); // Redirige al dashboard o a la página de perfil
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
          <Link href="/dashboard/polls" className={styles.link}>
            Volver al Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}