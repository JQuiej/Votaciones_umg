'use client';

import React from 'react';
import Link from 'next/link';
import styles from './home.module.css'; // Importa el archivo CSS del módulo
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap"></link>
export default function HomePage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>Bienvenido a Suffragium</h1>
        <p className={styles.description}>
          Crea encuestas interactivas, recopila opiniones en tiempo real y gestiona tus votaciones de forma sencilla y segura.
          Ideal para equipos, eventos o cualquier decisión grupal.
        </p>
        <div className={styles.buttonGroup}>
          <Link href="/auth/login" className={styles.buttonPrimary}>
            Iniciar Sesión
          </Link>
          <Link href="/auth/register" className={styles.buttonSecondary}>
            Registrarse
          </Link>
        </div>
      </div>
    </div>
  );
}