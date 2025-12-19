'use client';
import {UserProvider} from '@/contexts/user-context';
import {SessionProvider} from 'next-auth/react';

export function AuthSession({children}: {children: React.ReactNode}) {
  return (
    <SessionProvider>
      <UserProvider>{children}</UserProvider>
    </SessionProvider>
  );
}
