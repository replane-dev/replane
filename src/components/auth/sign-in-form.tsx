'use client';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {SiGithub, SiGitlab, SiGoogle, SiOkta} from '@icons-pack/react-simple-icons';
import {AlertCircle, Check, Copy, ExternalLink, Mail} from 'lucide-react';
import {signIn} from 'next-auth/react';
import {useState} from 'react';
import {toast} from 'sonner';

interface Provider {
  id: string;
  name: string;
}

interface SignInFormProps {
  providers: Provider[];
  callbackUrl: string;
  error?: string | null;
  allowedEmailDomains?: string[] | null;
}

const providerConfigs = [
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
          {providerConfigs.map(provider => {
            const Icon = provider.icon;
            const isExpanded = expandedProvider === provider.id;

            return (
              <div
                key={provider.id}
                className="rounded-lg border bg-card overflow-hidden transition-all"
              >
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

export function SignInForm({providers, callbackUrl, error, allowedEmailDomains}: SignInFormProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailDomainError, setEmailDomainError] = useState<string | null>(null);

  const hasEmailProvider = providers.some(p => p.id === 'email');
  const oauthProviders = providers.filter(p => p.id !== 'email');

  // Check if email domain is allowed
  const isEmailDomainAllowed = (email: string): boolean => {
    if (!allowedEmailDomains || allowedEmailDomains.length === 0) {
      return true; // No restrictions
    }

    const emailParts = email.split('@');
    if (emailParts.length !== 2) {
      return false; // Invalid email format
    }

    const domain = emailParts[1].toLowerCase();
    return allowedEmailDomains.some(allowed => allowed.toLowerCase() === domain);
  };

  const handleSignIn = async (providerId: string) => {
    setLoadingProvider(providerId);
    try {
      await signIn(providerId, {callbackUrl});
    } catch (error) {
      console.error('Sign in error:', error);
      setLoadingProvider(null);
    }
  };

  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail);
    setEmailDomainError(null);

    // Validate domain if there are restrictions and email has @ symbol
    if (allowedEmailDomains && allowedEmailDomains.length > 0 && newEmail.includes('@')) {
      if (!isEmailDomainAllowed(newEmail)) {
        const domain = newEmail.split('@')[1];
        setEmailDomainError(
          `Email domain "@${domain}" is not allowed. Please use an email from: ${allowedEmailDomains.map(d => `@${d}`).join(', ')}`,
        );
      }
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    // Validate domain before submitting
    if (!isEmailDomainAllowed(email)) {
      setEmailDomainError(
        `This email domain is not allowed. Please use an email from: ${allowedEmailDomains?.map(d => `@${d}`).join(', ')}`,
      );
      return;
    }

    setLoadingProvider('email');
    try {
      const result = await signIn('email', {
        email: email.trim(),
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        toast.error('Failed to send magic link', {
          description: 'Please try again or contact support.',
        });
      } else {
        setEmailSent(true);
        toast.success('Check your email', {
          description: 'We sent you a magic link to sign in.',
        });
      }
    } catch (error) {
      console.error('Email sign in error:', error);
      toast.error('Failed to send magic link');
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <Card className="dark:bg-muted">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Get started</CardTitle>
        <CardDescription>
          {providers.length > 0 ? 'Choose your sign in method' : 'Setup required'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-8">
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {allowedEmailDomains && allowedEmailDomains.length > 0 && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
              <p className="text-sm font-medium text-foreground mb-1">Email domain restrictions</p>
              <p className="text-sm text-muted-foreground">
                Only emails from the following domains are allowed:
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {allowedEmailDomains.map(domain => (
                  <code
                    key={domain}
                    className="inline-flex items-center rounded bg-blue-500/20 px-2 py-0.5 text-xs font-mono text-foreground"
                  >
                    @{domain}
                  </code>
                ))}
              </div>
            </div>
          )}

          {providers.length === 0 ? (
            <NoProvidersConfigured />
          ) : (
            <div className="flex flex-col gap-4">
              {/* OAuth providers */}
              {oauthProviders.length > 0 && (
                <div className="flex flex-col gap-2">
                  {oauthProviders.map(provider => {
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

              {/* Email magic link sign in */}
              {hasEmailProvider && (
                <div className="flex flex-col gap-4">
                  {oauthProviders.length > 0 && (
                    <div className="relative my-2">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                      </div>
                    </div>
                  )}
                  {emailSent ? (
                    <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
                      <Mail className="mx-auto mb-2 h-8 w-8 text-green-600 dark:text-green-400" />
                      <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-1">
                        Check your email
                      </p>
                      <p className="text-xs text-muted-foreground">
                        We sent a magic link to <strong>{email}</strong>
                      </p>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={() => {
                          setEmailSent(false);
                          setEmail('');
                        }}
                        className="mt-2"
                      >
                        Use a different email
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleEmailSignIn} className="space-y-2">
                      <div className="space-y-1">
                        <Label htmlFor="email">Email address</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="your.email@example.com"
                          value={email}
                          onChange={e => handleEmailChange(e.target.value)}
                          disabled={loadingProvider !== null}
                          required
                          className={emailDomainError ? 'border-destructive' : ''}
                        />
                        {emailDomainError && (
                          <p className="text-xs text-destructive">{emailDomainError}</p>
                        )}
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={loadingProvider !== null || !email.trim() || !!emailDomainError}
                      >
                        {loadingProvider === 'email' ? (
                          <>Sending magic link...</>
                        ) : (
                          <>
                            <Mail />
                            Continue with Email
                          </>
                        )}
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
