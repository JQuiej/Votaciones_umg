// src/app/components/Navbar.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './Navbar.module.css'

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Ocultar el menú en las páginas de autenticación
  if (pathname.startsWith('/auth/login') || pathname.startsWith('/auth/register') || pathname.startsWith('/vote')) {
    return null
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
        <Link href="/dashboard/crear_encuesta">Crear encuesta</Link>
        <Link href="/dashboard/polls">Mis encuestas</Link>
        <Link href="/dashboard/realtime">Encuestas en proceso</Link>
      </nav>

      {/* Backdrop sólo cuando esté abierto */}
      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} />}
    </>
  )
}
