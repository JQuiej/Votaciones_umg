// src/app/auth/register/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabaseClient';
import Swal from 'sweetalert2';
import styles from './register.module.css';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  
  // El estado de error local ya no es necesario, SweetAlert2 lo manejará.

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // 1. Se llama a signUp para registrar al usuario en el sistema de autenticación de Supabase.
    // Un trigger en la base de datos se encargará automáticamente de crear el registro
    // correspondiente en la tabla 'public.usuarios'.
    const { error } = await supabase.auth.signUp({ 
      email, 
      password: pass 
    });

    setLoading(false);

    if (error) {
      // Si hay un error, lo mostramos con SweetAlert2.
      Swal.fire({
        icon: 'error',
        title: 'Error en el Registro',
        text: error.message,
      });
      return;
    }

    // 2. Si el registro es exitoso, mostramos un mensaje de éxito.
    // La sesión no se inicia hasta que el usuario confirma su correo.
    await Swal.fire({
      icon: 'success',
      title: '¡Registro Exitoso!',
      text: 'Hemos enviado un enlace de confirmación a tu correo electrónico. Por favor, revísalo para activar tu cuenta.',
      confirmButtonText: 'Entendido'
    });
    
    // 3. Redirigimos al usuario a la página de login para que inicie sesión después de confirmar.
    router.push('/auth/login');
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Crear Cuenta</h1>
        {/* El mensaje de error local se elimina, ya que Swal lo gestiona */}
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
              minLength={6} // Es una buena práctica validar la longitud mínima
            />
          </div>
          <button type="submit" className={styles.buttonPrimary} disabled={loading}>
            {loading ? 'Registrando...' : 'Crear Cuenta'}
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