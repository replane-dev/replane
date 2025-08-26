'use client';
import {SignOutButton} from '@/components/auth/sign-out-button';
import {useSession} from 'next-auth/react';

export default function ClientUserPage() {
  const {data: session, status} = useSession();
  const user = session?.user;

  if (status === 'loading') {
    return <main style={{padding: 24}}>Loading session…</main>;
  }

  return (
    <main style={{padding: 24}}>
      <h1>Client-rendered user</h1>
      {user ? (
        <div style={{marginTop: 12}}>
          {user.image && (
            <img src={user.image} alt={user.name ?? 'User avatar'} width={64} height={64} style={{borderRadius: 8}} />
          )}
          <p>
            <strong>Name:</strong> {user.name ?? '—'}
          </p>
          <p>
            <strong>Email:</strong> {user.email ?? '—'}
          </p>
          <div style={{marginTop: 16}}>
            <SignOutButton />
          </div>
        </div>
      ) : (
        <p>No session found.</p>
      )}
    </main>
  );
}
