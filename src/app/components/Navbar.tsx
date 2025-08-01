'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation' // Importar useRouter
import { supabase } from '../../lib/supabaseClient' // Importar supabase
import styles from './Navbar.module.css'

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter() // Inicializar useRouter

  // Ocultar el menú en las páginas de autenticación y votación
  if (pathname.startsWith('/auth/login') || pathname.startsWith('/auth/register') || pathname.startsWith('/vote') || pathname.startsWith('/auth/pass') || pathname.startsWith('/page.tsx')) {
    return null
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error al cerrar sesión:', error.message)
      // Opcional: mostrar un mensaje de error al usuario
      alert('Error al cerrar sesión. Inténtalo de nuevo.')
    } else {
      router.push('/auth/login') // Redirigir a la página de login después de cerrar sesión
    }
  }

  return (
    <>
      {/* Botón hamburguesa */}
      <button
        className={`${styles.hamburger} ${open ? styles.open : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Toggle menu"
      >
        <span className={styles.bar} />
        <span className={styles.bar} />
        <span className={styles.bar} />
      </button>

      {/* Sidebar deslizable */}
      <nav className={`${styles.nav} ${open ? styles.open : ''}`}>
        <Link href="/dashboard/crear_encuesta" onClick={() => setOpen(false)}>Crear encuesta</Link>
        <Link href="/dashboard/polls"className={`${styles.navLink} ${pathname === '/dashboard/polls' ? styles.active : ''}`} onClick={() => setOpen(false)}>Mis encuestas</Link>
        <Link href="/dashboard/realtime" onClick={() => setOpen(false)}>Encuestas en proceso</Link>
        {/* Botón de cerrar sesión */}
        <button
          className={styles.logoutButton}
          onClick={handleSignOut}
        >
          Cerrar Sesión
        </button>
      </nav>

      {/* Backdrop sólo cuando esté abierto */}
      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} />}
    </>
  )
}