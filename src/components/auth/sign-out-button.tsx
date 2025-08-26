'use client';
import {Button} from '@/components/ui/button';
import {signOut} from 'next-auth/react';

export function SignOutButton({className}: {className?: string}) {
  return (
    <Button variant="outline" className={className} onClick={() => signOut({callbackUrl: '/'})} aria-label="Sign out">
      Sign out
    </Button>
  );
}
