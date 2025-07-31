'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './page.module.css'

export default function VoteEntryPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) {
      setError('Por favor ingresa un código válido.')
      return
    }
    // Navega a la ruta de votación
    router.push(`/vote/${trimmed}`)
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Acceder a la votación</h1>
      <form onSubmit={handleSubmit} className={styles.form}>
        <input
          type="text"
          value={code}
          onChange={e => {
            setCode(e.target.value)
            setError(null)
          }}
          placeholder="Introduce tu código de acceso"
          className={styles.input}
        />
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className={styles.button}>
          Entrar
        </button>
      </form>
    </div>
  )
}
