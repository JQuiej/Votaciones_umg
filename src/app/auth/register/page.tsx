// src/app/auth/register/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pass, setPass]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // 1) Creamos el usuario en Auth
    const { data, error: authError } = 
      await supabase.auth.signUp({ email, password: pass });

    if (authError) {
      alert(authError.message);
      setLoading(false);
      return;
    }

    // data.session será null si se requiere confirmación por email
    const session = data.session;
    const user    = data.user;

    // 2) Si user existe, guardamos en nuestra tabla 'usuarios'
    if (user) {
      const { error: insertError } = await supabase
        .from('usuarios')
        .insert({
          id_usuario: user.id,
          correo_electronico: email,
          pass              : pass  // Ideal: aquí pondrías un hash, no texto plano
        });

      if (insertError) {
        alert('Error al guardar en usuarios: ' + insertError.message);
        setLoading(false);
        return;
      }
    }

    // 3) Redirección según si tenemos sesión o no
    if (session) {
      // ¡Se creó la sesión, vamos al dashboard!
      router.push('/dashboard');
    } else {
      // No hay sesión: requiere confirmación por email
      alert(
        '¡Registro exitoso! Revisa tu correo para confirmar tu cuenta y luego inicia sesión.'
      );
      router.push('/auth/login');
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '2rem auto' }}>
      <h1>Crear cuenta</h1>
      <form onSubmit={handleRegister}>
        <input
          type="email"
          placeholder="Correo electrónico"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Registrando...' : 'Registrar'}
        </button>
      </form>
    </div>
  );
}
