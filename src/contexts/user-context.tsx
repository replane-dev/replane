'use client';

import {getUserImageUrl} from '@/lib/user-image';
import {useSession} from 'next-auth/react';
import {createContext, useCallback, useContext, useMemo, useState, type ReactNode} from 'react';

interface UserData {
  id: string | undefined;
  email: string | undefined;
  name: string | undefined;
}

interface UserContextValue {
  /** User data from session */
  user: UserData;
  /** Whether the session is loading */
  isLoading: boolean;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Get the user's image URL with cache busting */
  userImageUrl: string | undefined;
  /** Invalidate the user image cache (call after image update) */
  invalidateUserImage: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({children}: {children: ReactNode}) {
  const {data: session, status} = useSession();
  const [imageVersion, setImageVersion] = useState(0);

  const sessionUser = session?.user;
  const userId = (sessionUser as any)?.id;

  const user = useMemo<UserData>(
    () => ({
      id: userId,
      email: sessionUser?.email ?? undefined,
      name: sessionUser?.name ?? undefined,
    }),
    [userId, sessionUser?.email, sessionUser?.name],
  );

  const userImageUrl = useMemo(() => {
    const baseUrl = getUserImageUrl(userId);
    if (!baseUrl) return undefined;
    return `${baseUrl}?v=${imageVersion}`;
  }, [userId, imageVersion]);

  const invalidateUserImage = useCallback(() => {
    setImageVersion(v => v + 1);
  }, []);

  const value = useMemo<UserContextValue>(
    () => ({
      user,
      isLoading: status === 'loading',
      isAuthenticated: status === 'authenticated',
      userImageUrl,
      invalidateUserImage,
    }),
    [user, status, userImageUrl, invalidateUserImage],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

/**
 * Hook to get just the user's email (common use case).
 * Throws if not authenticated.
 */
export function useUserEmail(): string {
  const {user, isAuthenticated} = useUser();
  if (!isAuthenticated || !user.email) {
    throw new Error('User email is required');
  }
  return user.email;
}
