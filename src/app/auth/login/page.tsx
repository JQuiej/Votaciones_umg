// app/auth/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const router = useRouter();

  async function handleLogin() {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (!error) router.push('/dashboard');
    else alert(error.message);
  }

  return (
    <div>
      <h1>Iniciar sesión</h1>
      <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
      <input placeholder="Contraseña" type="password" value={pass} onChange={e => setPass(e.target.value)} />
      <button onClick={handleLogin}>Entrar</button>
    </div>
  );
}
