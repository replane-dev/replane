import {SignOutButton} from '@/components/auth/sign-out-button';
import {getServerSession} from 'next-auth';
import {authOptions} from '../auth-options';

export default async function ServerUserPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  return (
    <main style={{padding: 24}}>
      <h1>Server-rendered user</h1>
      {user ? (
        <div style={{marginTop: 12}}>
          {user.image && (
            <img
              src={user.image}
              alt={user.name ?? 'User avatar'}
              width={64}
              height={64}
              style={{borderRadius: 8}}
            />
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
