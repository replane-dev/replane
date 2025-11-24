'use client';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {REPLANE_USER_VISITED_KEY} from '@/lib/constants';
import {SiGithub, SiGitlab, SiGoogle, SiOkta} from '@icons-pack/react-simple-icons';
import {signIn} from 'next-auth/react';
import {useMemo, useState} from 'react';

interface Provider {
  id: string;
  name: string;
}

interface SignInFormProps {
  providers: Provider[];
  callbackUrl: string;
  error?: string | null;
}

export function SignInForm({providers, callbackUrl, error}: SignInFormProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const isReturningUser = useMemo(
    () => localStorage.getItem(REPLANE_USER_VISITED_KEY) === 'true',
    [],
  );

  const handleSignIn = async (providerId: string) => {
    setLoadingProvider(providerId);
    try {
      await signIn(providerId, {callbackUrl});
    } catch (error) {
      console.error('Sign in error:', error);
      setLoadingProvider(null);
    }
  };

  return (
    <Card className="dark:bg-muted">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          {isReturningUser ? 'Welcome back' : 'Get started'}
        </CardTitle>
        <CardDescription>
          {providers.length > 0
            ? 'Choose your sign in method'
            : 'No authentication providers configured'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {providers.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
              No authentication providers configured. Please configure one or more OAuth providers
              in your environment variables (GitHub, GitLab, Google, or Okta).
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {providers.map(provider => {
                const isLoading = loadingProvider === provider.id;

                // Map provider IDs to icons and labels
                const providerConfig: Record<string, {icon: typeof SiGithub; label: string}> = {
                  github: {icon: SiGithub, label: 'Continue with GitHub'},
                  gitlab: {icon: SiGitlab, label: 'Continue with GitLab'},
                  google: {icon: SiGoogle, label: 'Continue with Google'},
                  okta: {icon: SiOkta, label: 'Continue with Okta'},
                };

                const config = providerConfig[provider.id];
                const Icon = config?.icon;
                const label = config?.label || `Continue with ${provider.name}`;

                return (
                  <Button
                    key={provider.id}
                    type="button"
                    variant="outline"
                    onClick={() => handleSignIn(provider.id)}
                    disabled={loadingProvider !== null}
                    className="w-full"
                  >
                    {Icon && <Icon className={isLoading ? 'animate-pulse' : ''} />}
                    {isLoading ? 'Signing in...' : label}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
