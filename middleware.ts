// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Si ya está en /auth/*, dejamos pasar
  if (pathname.startsWith('/auth/')) {
    return NextResponse.next();
  }

  // Redirigir raíz (o cualquier otra ruta) al login
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  return NextResponse.next();
}
