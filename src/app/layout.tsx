// src/app/layout.tsx
import './globals.css'
import Navbar from './components/Navbar'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Navbar />
        {/* aquí NO ponemos margin ni flex */}
        <main className="mainContent">
          {children}
        </main>
      </body>
    </html>
  )
}
