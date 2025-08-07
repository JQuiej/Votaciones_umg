'use client';

import React, { useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import Link from 'next/link';
import styles from './olvide_pass.module.css'; // Importar el archivo CSS del módulo

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    // Llama a la función de Supabase para enviar el email de restablecimiento
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/update-password`,
    });

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
    } else {
      setMessage('Se ha enviado un enlace para restablecer tu contraseña a tu correo electrónico. Por favor, revisa tu bandeja de entrada (y la carpeta de spam).');
      setEmail(''); // Limpiar el campo de email
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Recuperar Contraseña</h1>
        {message && <p className={styles.successMessage}>{message}</p>}
        {error && <p className={styles.errorMessage}>{error}</p>}
        <form onSubmit={handleResetPassword}>
          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.label}>Email</label>
            <input
              id="email"
              className={styles.input}
              placeholder="tucorreo@ejemplo.com"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={loading || !!message} // Deshabilita si está cargando o ya se envió el mensaje
              required
            />
          </div>
          <button
            className={styles.buttonPrimary}
            type="submit"
            disabled={loading || !!message}
          >
            {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
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