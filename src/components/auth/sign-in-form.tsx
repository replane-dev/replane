'use client';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {zodResolver} from '@hookform/resolvers/zod';
import {SiGithub, SiGitlab, SiGoogle, SiOkta} from '@icons-pack/react-simple-icons';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
} from 'lucide-react';
import {signIn} from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import {useState} from 'react';
import {useForm} from 'react-hook-form';
import {toast} from 'sonner';
import {z} from 'zod';
import gmailIcon from './gmail-icon.svg';
import outlookIcon from './outlook-icon.svg';
import protonmailIcon from './protonmail-icon.svg';
import {
  type AuthProvider,
  EmailDomainNotice,
  ErrorBanner,
  OAuthProviders,
  OrDivider,
  PasswordInput,
} from './shared';
import yahooIcon from './yahoo-icon.svg';

// ============================================================================
// Types
// ============================================================================

interface SignInFormProps {
  providers: AuthProvider[];
  callbackUrl: string;
  error?: string | null;
  allowedEmailDomains?: string[] | null;
  passwordAuthEnabled?: boolean;
}

const PROVIDER_SETUP_INFO = [
  {
    id: 'github',
    name: 'GitHub',
    icon: SiGithub,
    color: 'text-[#181717] dark:text-white',
    envVars: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
    setupUrl: 'https://github.com/settings/developers',
    setupLabel: 'GitHub Developer Settings',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    icon: SiGitlab,
    color: 'text-[#FC6D26]',
    envVars: ['GITLAB_CLIENT_ID', 'GITLAB_CLIENT_SECRET'],
    setupUrl: 'https://gitlab.com/-/user_settings/applications',
    setupLabel: 'GitLab Applications',
  },
  {
    id: 'google',
    name: 'Google',
    icon: SiGoogle,
    color: 'text-[#4285F4]',
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    setupUrl: 'https://console.cloud.google.com/apis/credentials',
    setupLabel: 'Google Cloud Console',
  },
  {
    id: 'okta',
    name: 'Okta',
    icon: SiOkta,
    color: 'text-[#007DC1]',
    envVars: ['OKTA_CLIENT_ID', 'OKTA_CLIENT_SECRET', 'OKTA_ISSUER'],
    setupUrl: 'https://developer.okta.com/docs/guides/implement-oauth-for-okta/',
    setupLabel: 'Okta Developer Docs',
  },
];

// ============================================================================
// Validation Schemas (simplified - domain validation happens server-side)
// ============================================================================

const passwordFormSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const magicLinkFormSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
});

// ============================================================================
// Small Reusable Components
// ============================================================================

function CopyButton({text}: {text: string}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 p-1 rounded hover:bg-muted-foreground/20 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-3 h-3 text-green-500" />
      ) : (
        <Copy className="w-3 h-3 opacity-50" />
      )}
    </button>
  );
}

function EmailProviderLink({
  href,
  title,
  icon,
  hoverColor,
}: {
  href: string;
  title: string;
  icon: React.ReactNode;
  hoverColor?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={`w-12 h-12 flex justify-center items-center border border-muted-foreground/20 bg-muted/30 rounded-xl transition-all hover:scale-105 ${hoverColor ?? 'hover:text-foreground'}`}
    >
      {icon}
    </a>
  );
}

// ============================================================================
// Password Sign-In Form
// ============================================================================

interface PasswordFormProps {
  callbackUrl: string;
  showBackButton?: boolean;
  onBack?: () => void;
  onInteraction?: () => void;
}

function PasswordForm({callbackUrl, showBackButton, onBack, onInteraction}: PasswordFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState(false);

  const handleInteraction = () => {
    setAuthError(false);
    onInteraction?.();
  };

  type FormData = z.infer<typeof passwordFormSchema>;

  const {
    register,
    handleSubmit,
    formState: {errors},
  } = useForm<FormData>({
    resolver: zodResolver(passwordFormSchema),
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setAuthError(false);

    try {
      const result = await signIn('credentials', {
        email: data.email.trim(),
        password: data.password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setAuthError(true);
        // Check for rate limiting error
        if (result.error.includes('Too many')) {
          toast.error('Too many attempts', {
            description: 'Please wait a moment before trying again.',
          });
        } else {
          toast.error('Sign in failed', {
            description: 'Invalid email or password. Please try again.',
          });
        }
      } else if (result?.ok) {
        window.location.href = callbackUrl;
      }
    } catch {
      setAuthError(true);
      toast.error('Sign in failed', {
        description: 'Please check your connection and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      {showBackButton && onBack && (
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="mb-2 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      )}

      <div className="space-y-1">
        <Label htmlFor="password-email">Email</Label>
        <Input
          id="password-email"
          type="email"
          placeholder="your.email@example.com"
          disabled={isLoading}
          className={errors.email ? 'border-destructive' : ''}
          {...register('email', {onChange: handleInteraction})}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="password-input">Password</Label>
        <PasswordInput
          id="password-input"
          placeholder="••••••••"
          disabled={isLoading}
          error={!!errors.password || authError}
          {...register('password', {onChange: handleInteraction})}
        />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        {authError && !errors.password && (
          <p className="text-xs text-destructive">Invalid email or password</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" />
            Signing in...
          </>
        ) : (
          <>
            <KeyRound className="h-4 w-4" />
            Sign in
          </>
        )}
      </Button>

      <div className="text-center text-sm">
        Don&apos;t have an account?{' '}
        <Link
          href={`/auth/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="text-primary hover:underline font-medium"
        >
          Sign up
        </Link>
      </div>
    </form>
  );
}

// ============================================================================
// Magic Link Form
// ============================================================================

interface MagicLinkFormProps {
  callbackUrl: string;
  onInteraction?: () => void;
}

function MagicLinkForm({callbackUrl, onInteraction}: MagicLinkFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  type FormData = z.infer<typeof magicLinkFormSchema>;

  const {
    register,
    handleSubmit,
    formState: {errors},
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(magicLinkFormSchema),
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);

    try {
      const result = await signIn('email', {
        email: data.email.trim(),
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        toast.error('Unable to send sign-in link', {
          description: 'Please check your email address and try again.',
        });
      } else {
        setSentEmail(data.email);
        setEmailSent(true);
        toast.success('Check your email', {
          description: 'We sent you a magic link to sign in.',
        });
      }
    } catch {
      toast.error('Unable to send sign-in link', {
        description: 'Please check your connection and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
        <Mail className="mx-auto mb-2 h-8 w-8 text-green-600 dark:text-green-400" />
        <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-1">
          Check your email
        </p>
        <p className="text-xs text-muted-foreground">
          We sent a magic link to <strong>{sentEmail}</strong>
        </p>

        {/* Email provider quick links */}
        <div className="flex justify-center items-center gap-3 mt-4">
          <EmailProviderLink
            href="https://mail.google.com"
            title="Open Gmail"
            hoverColor="hover:text-[#EA4335]"
            icon={<Image src={gmailIcon} alt="Gmail" className="w-5 h-5" />}
          />
          <EmailProviderLink
            href="https://outlook.live.com"
            title="Open Outlook"
            hoverColor="hover:text-[#0078D4]"
            icon={<Image src={outlookIcon} alt="Outlook Mail" className="w-5 h-5" />}
          />
          <EmailProviderLink
            href="https://mail.yahoo.com"
            title="Open Yahoo Mail"
            hoverColor="hover:text-[#6001D2]"
            icon={<Image src={yahooIcon} alt="Yahoo Mail" className="w-5 h-5" />}
          />
          <EmailProviderLink
            href="https://proton.me/mail"
            title="Open Proton Mail"
            hoverColor="hover:text-[#6D4AFF]"
            icon={<Image src={protonmailIcon} alt="Proton Mail" className="w-5 h-5" />}
          />
        </div>

        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => {
            setEmailSent(false);
            setSentEmail('');
            reset();
          }}
          className="mt-3"
        >
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor="magic-email">Email address</Label>
        <Input
          id="magic-email"
          type="email"
          placeholder="your.email@example.com"
          disabled={isLoading}
          className={errors.email ? 'border-destructive' : ''}
          {...register('email', {onChange: onInteraction})}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <Button type="submit" className="w-full" variant="outline" disabled={isLoading}>
        {isLoading ? (
          'Sending magic link...'
        ) : (
          <>
            <Mail />
            Continue with Email
          </>
        )}
      </Button>
    </form>
  );
}

// ============================================================================
// No Providers Configured
// ============================================================================

function NoProvidersConfigured() {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Authentication not configured</p>
          <p className="text-sm text-muted-foreground">
            To enable sign-in, configure at least one OAuth provider by setting the required
            environment variables.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Available Providers
        </p>
        <div className="space-y-2">
          {PROVIDER_SETUP_INFO.map(provider => {
            const Icon = provider.icon;
            const isExpanded = expandedProvider === provider.id;

            return (
              <div key={provider.id} className="rounded-lg border bg-card overflow-hidden">
                <button
                  onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <Icon className={`w-5 h-5 ${provider.color}`} />
                  <span className="font-medium text-sm flex-1">{provider.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {provider.envVars.length} env {provider.envVars.length === 1 ? 'var' : 'vars'}
                  </span>
                  <svg
                    className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="border-t bg-muted/30 p-3 space-y-3">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Required environment variables:
                      </p>
                      <div className="space-y-1">
                        {provider.envVars.map(envVar => (
                          <div
                            key={envVar}
                            className="flex items-center justify-between bg-background/80 rounded px-2 py-1.5 font-mono text-xs"
                          >
                            <span>{envVar}=your_value_here</span>
                            <CopyButton text={`${envVar}=`} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <a
                      href={provider.setupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {provider.setupLabel}
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-dashed bg-muted/20 p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Quick start example:</p>
        <div className="bg-background/80 rounded p-2 font-mono text-xs space-y-0.5 overflow-x-auto">
          <div className="text-muted-foreground"># Add to your .env file</div>
          <div>GITHUB_CLIENT_ID=your_client_id</div>
          <div>GITHUB_CLIENT_SECRET=your_client_secret</div>
        </div>
        <p className="text-xs text-muted-foreground">
          After adding the environment variables, restart the application.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Main Sign-In Form
// ============================================================================

export function SignInForm({
  providers,
  callbackUrl,
  error,
  allowedEmailDomains,
  passwordAuthEnabled,
}: SignInFormProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);

  const hasEmailProvider = providers.some(p => p.id === 'email');
  const hasCredentialsProvider = providers.some(p => p.id === 'credentials');
  const oauthProviders = providers.filter(p => p.id !== 'email' && p.id !== 'credentials');

  const hasOtherProviders = oauthProviders.length > 0 || hasEmailProvider;
  const passwordIsOnlyOption = hasCredentialsProvider && !hasOtherProviders;
  const noProvidersAvailable = providers.length === 0 && !passwordAuthEnabled;

  const handleOAuthSignIn = async (providerId: string) => {
    setLoadingProvider(providerId);
    try {
      await signIn(providerId, {callbackUrl});
    } catch {
      setLoadingProvider(null);
    }
  };

  return (
    <Card className="dark:bg-muted">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Get started</CardTitle>
        <CardDescription>
          {providers.length > 0 ? 'Sign in to your account' : 'Setup required'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          {error && !errorDismissed && <ErrorBanner message={error} />}

          {allowedEmailDomains && allowedEmailDomains.length > 0 && (
            <EmailDomainNotice domains={allowedEmailDomains} />
          )}

          {noProvidersAvailable ? (
            <NoProvidersConfigured />
          ) : (
            <div className="flex flex-col gap-4">
              {/* Password form - expanded when it's the only option or user selected it */}
              {hasCredentialsProvider && (passwordIsOnlyOption || showPasswordForm) && (
                <PasswordForm
                  callbackUrl={callbackUrl}
                  showBackButton={!passwordIsOnlyOption && showPasswordForm}
                  onBack={() => setShowPasswordForm(false)}
                  onInteraction={() => setErrorDismissed(true)}
                />
              )}

              {/* Provider selection - shown when password form is not expanded */}
              {!showPasswordForm && !passwordIsOnlyOption && (
                <>
                  {/* OAuth buttons */}
                  <OAuthProviders
                    providers={oauthProviders}
                    callbackUrl={callbackUrl}
                    variant="signin"
                    onSignIn={handleOAuthSignIn}
                    loadingProvider={loadingProvider}
                  />

                  {/* Password option button */}
                  {hasCredentialsProvider && hasOtherProviders && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowPasswordForm(true)}
                      className="w-full"
                    >
                      <KeyRound className="h-4 w-4" />
                      Continue with Password
                    </Button>
                  )}

                  {/* Divider between OAuth/password and magic link */}
                  {hasEmailProvider && (oauthProviders.length > 0 || hasCredentialsProvider) && (
                    <OrDivider />
                  )}

                  {/* Magic link form */}
                  {hasEmailProvider && (
                    <MagicLinkForm
                      callbackUrl={callbackUrl}
                      onInteraction={() => setErrorDismissed(true)}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
