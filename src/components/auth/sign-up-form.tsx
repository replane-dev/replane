'use client';

import {NO_SIGNUP_REDIRECT_PARAM, NO_SIGNUP_REDIRECT_VALUE} from '@/app/auth/signup/page';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {MIN_PASSWORD_LENGTH} from '@/engine/core/constants';
import {useTRPC} from '@/trpc/client';
import {zodResolver} from '@hookform/resolvers/zod';
import * as Sentry from '@sentry/nextjs';
import {useMutation} from '@tanstack/react-query';
import {KeyRound, Loader2} from 'lucide-react';
import {signIn} from 'next-auth/react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import {useForm} from 'react-hook-form';
import {toast} from 'sonner';
import {z} from 'zod';
import {
  type AuthProvider,
  EmailDomainNotice,
  ErrorBanner,
  OAuthProviders,
  OrDivider,
  PasswordInput,
  PasswordStrengthIndicator,
} from './shared';

interface SignUpFormProps {
  callbackUrl: string;
  allowedEmailDomains?: string[] | null;
  providers?: AuthProvider[];
  passwordAuthEnabled?: boolean;
}

// Simplified schema - domain validation happens server-side
const signUpSchema = z.object({
  name: z.string().optional(),
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});

type FormData = z.infer<typeof signUpSchema>;

export function SignUpForm({
  callbackUrl,
  allowedEmailDomains,
  providers = [],
  passwordAuthEnabled = true,
}: SignUpFormProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const registerMutation = useMutation(trpc.registerWithPassword.mutationOptions());
  const [serverError, setServerError] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState('');
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  // Filter to only OAuth providers (not email or credentials)
  const oauthProviders = providers.filter(p => p.id !== 'email' && p.id !== 'credentials');

  const handleOAuthSignIn = async (providerId: string) => {
    setLoadingProvider(providerId);
    try {
      await signIn(providerId, {callbackUrl});
    } catch {
      setLoadingProvider(null);
    }
  };

  const {
    register,
    handleSubmit,
    formState: {errors},
  } = useForm<FormData>({
    resolver: zodResolver(signUpSchema),
  });

  const handleInteraction = () => {
    setServerError(null);
  };

  const onSubmit = async (data: FormData) => {
    setServerError(null);

    try {
      await registerMutation.mutateAsync({
        email: data.email.trim(),
        password: data.password,
        name: data.name?.trim() || undefined,
      });

      toast.success('Account created successfully!', {
        description: 'Signing you in...',
      });

      // Sign in with the new credentials
      const result = await signIn('credentials', {
        email: data.email.trim(),
        password: data.password,
        redirect: false,
        callbackUrl,
      });

      if (result?.ok) {
        router.push(callbackUrl);
      } else {
        // Account created but sign-in failed, redirect to sign-in page
        router.push(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      }
    } catch (error: any) {
      Sentry.captureException(error);
      console.error(error);
      const message = error?.message || 'Failed to create account. Please try again.';
      setServerError(message);
      toast.error('Registration failed', {
        description: message,
      });
    }
  };

  return (
    <Card className="dark:bg-muted">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Create an account</CardTitle>
        <CardDescription>Enter your details to get started</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {serverError && <ErrorBanner message={serverError} />}

          {allowedEmailDomains && allowedEmailDomains.length > 0 && (
            <EmailDomainNotice domains={allowedEmailDomains} />
          )}

          {/* OAuth Providers */}
          <OAuthProviders
            providers={oauthProviders}
            callbackUrl={callbackUrl}
            variant="signup"
            onSignIn={handleOAuthSignIn}
            loadingProvider={loadingProvider}
          />

          {/* Divider between OAuth and password form */}
          {oauthProviders.length > 0 && passwordAuthEnabled && <OrDivider />}

          {/* Password registration form */}
          {passwordAuthEnabled && (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <div className="space-y-1">
                <Label htmlFor="name">Name (optional)</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  disabled={registerMutation.isPending}
                  {...register('name', {onChange: handleInteraction})}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  disabled={registerMutation.isPending}
                  className={errors.email ? 'border-destructive' : ''}
                  {...register('email', {onChange: handleInteraction})}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  placeholder="••••••••"
                  disabled={registerMutation.isPending}
                  error={!!errors.password}
                  {...register('password', {
                    onChange: e => {
                      setPasswordValue(e.target.value);
                      handleInteraction();
                    },
                  })}
                />
                {errors.password ? (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                ) : (
                  <>
                    <PasswordStrengthIndicator password={passwordValue} />
                    {!passwordValue && (
                      <p className="text-xs text-muted-foreground">
                        Must be at least {MIN_PASSWORD_LENGTH} characters
                      </p>
                    )}
                  </>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Creating account...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" />
                    Create account
                  </>
                )}
              </Button>
            </form>
          )}

          <div className="text-center text-sm">
            Already have an account?{' '}
            <Link
              href={`/auth/signin?${NO_SIGNUP_REDIRECT_PARAM}=${NO_SIGNUP_REDIRECT_VALUE}&callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="text-primary hover:underline font-medium"
            >
              Sign in
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
