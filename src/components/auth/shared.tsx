'use client';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {cn} from '@/lib/utils';
import {SiGithub, SiGitlab, SiGoogle, SiOkta} from '@icons-pack/react-simple-icons';
import {Eye, EyeOff} from 'lucide-react';
import {forwardRef, useState} from 'react';

// ============================================================================
// Types
// ============================================================================

export interface AuthProvider {
  id: string;
  name: string;
}

// ============================================================================
// Provider Configuration
// ============================================================================

export const OAUTH_PROVIDER_CONFIG: Record<string, {icon: typeof SiGithub; label: string}> = {
  github: {icon: SiGithub, label: 'GitHub'},
  gitlab: {icon: SiGitlab, label: 'GitLab'},
  google: {icon: SiGoogle, label: 'Google'},
  okta: {icon: SiOkta, label: 'Okta'},
};

// ============================================================================
// OAuth Provider Button
// ============================================================================

interface OAuthButtonProps {
  provider: AuthProvider;
  isLoading: boolean;
  disabled: boolean;
  onSignIn: () => void;
  variant?: 'signin' | 'signup';
}

export function OAuthButton({
  provider,
  isLoading,
  disabled,
  onSignIn,
  variant = 'signin',
}: OAuthButtonProps) {
  const config = OAUTH_PROVIDER_CONFIG[provider.id];
  const Icon = config?.icon;
  const providerLabel = config?.label || provider.name;
  const actionLabel = variant === 'signup' ? 'Sign up with' : 'Continue with';
  const label = `${actionLabel} ${providerLabel}`;

  return (
    <Button type="button" variant="outline" onClick={onSignIn} disabled={disabled} className="w-full">
      {Icon && <Icon className={isLoading ? 'animate-pulse' : ''} />}
      {isLoading ? 'Signing in...' : label}
    </Button>
  );
}

// ============================================================================
// OAuth Providers List
// ============================================================================

interface OAuthProvidersProps {
  providers: AuthProvider[];
  callbackUrl: string;
  variant?: 'signin' | 'signup';
  onSignIn: (providerId: string) => Promise<void>;
  loadingProvider: string | null;
}

export function OAuthProviders({
  providers,
  variant = 'signin',
  onSignIn,
  loadingProvider,
}: OAuthProvidersProps) {
  if (providers.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {providers.map(provider => (
        <OAuthButton
          key={provider.id}
          provider={provider}
          isLoading={loadingProvider === provider.id}
          disabled={loadingProvider !== null}
          onSignIn={() => onSignIn(provider.id)}
          variant={variant}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Email Domain Notice
// ============================================================================

interface EmailDomainNoticeProps {
  domains: string[];
}

export function EmailDomainNotice({domains}: EmailDomainNoticeProps) {
  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
      <p className="text-sm font-medium text-foreground mb-1">Email domain restrictions</p>
      <p className="text-sm text-muted-foreground">
        Only emails from the following domains are allowed:
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {domains.map(domain => (
          <code
            key={domain}
            className="inline-flex items-center rounded bg-blue-500/20 px-2 py-0.5 text-xs font-mono text-foreground"
          >
            @{domain}
          </code>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Error Banner
// ============================================================================

interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({message}: ErrorBannerProps) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      {message}
    </div>
  );
}

// ============================================================================
// Or Divider
// ============================================================================

export function OrDivider() {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card dark:bg-muted px-2 text-muted-foreground">or</span>
      </div>
    </div>
  );
}

// ============================================================================
// Password Input with Toggle
// ============================================================================

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({className, error, ...props}, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={showPassword ? 'text' : 'password'}
          className={cn(error && 'border-destructive', 'pr-10', className)}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
          onClick={() => setShowPassword(!showPassword)}
          tabIndex={-1}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
        </Button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

// ============================================================================
// Password Strength Indicator
// ============================================================================

interface PasswordStrengthIndicatorProps {
  password: string;
}

interface PasswordAnalysis {
  strength: number;
  hasMinLength: boolean;
  hasGoodLength: boolean;
  hasLowercase: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

function analyzePassword(password: string): PasswordAnalysis {
  const hasMinLength = password.length >= 8;
  const hasGoodLength = password.length >= 12;
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  let strength = 0;
  if (hasMinLength) strength++;
  if (hasGoodLength) strength++;
  if (hasLowercase) strength++;
  if (hasUppercase) strength++;
  if (hasNumber) strength++;
  if (hasSpecial) strength++;

  return {
    strength: Math.min(4, Math.floor(strength * 0.7)),
    hasMinLength,
    hasGoodLength,
    hasLowercase,
    hasUppercase,
    hasNumber,
    hasSpecial,
  };
}

function getStrengthTip(analysis: PasswordAnalysis): string | null {
  // Return the most impactful suggestion
  if (!analysis.hasMinLength) {
    return 'Add more characters (8+ required)';
  }
  if (!analysis.hasUppercase && !analysis.hasLowercase) {
    return 'Add letters';
  }
  if (analysis.hasLowercase && !analysis.hasUppercase) {
    return 'Add an uppercase letter';
  }
  if (analysis.hasUppercase && !analysis.hasLowercase) {
    return 'Add a lowercase letter';
  }
  if (!analysis.hasNumber) {
    return 'Add a number';
  }
  if (!analysis.hasSpecial) {
    return 'Add a special character (!@#$...)';
  }
  if (!analysis.hasGoodLength) {
    return 'Make it longer for extra security';
  }
  return null;
}

const strengthLabels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
const strengthColors = [
  'bg-red-500',
  'bg-orange-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
];

export function PasswordStrengthIndicator({password}: PasswordStrengthIndicatorProps) {
  if (!password) return null;

  const analysis = analyzePassword(password);
  const tip = getStrengthTip(analysis);

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i <= analysis.strength ? strengthColors[analysis.strength] : 'bg-muted',
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{strengthLabels[analysis.strength]}</p>
        {tip && <p className="text-xs text-muted-foreground">· {tip}</p>}
      </div>
    </div>
  );
}
