// utils/withAuth.tsx
import React, { useEffect } from 'react';
import type { JSX } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export function withAuth<P>(WrappedComponent: NextPage<P>): NextPage<P> {
  const AuthComponent: NextPage<P> = (props: P) => {
    const router = useRouter();

    useEffect(() => {
      (async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();   // v2: getSession()
        if (!session) {
          router.replace('/auth/login');
        }
      })();
    }, [router]);

    return <WrappedComponent {...(props as P & JSX.IntrinsicAttributes)} />;
  };

  // Para facilitar debugging en React DevTools
  AuthComponent.displayName = `withAuth(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return AuthComponent;
}
