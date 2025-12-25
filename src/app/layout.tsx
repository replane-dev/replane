import {AuthSession} from '@/components/auth-session';
import {BrowserOnly} from '@/components/browser-only';
import {ErrorFallback} from '@/components/error-fallback';
import {DelayedFullscreenSpinner} from '@/components/spinner';
import {ThemeProvider} from '@/components/theme-provider';
import {Toaster} from '@/components/ui/sonner';
import {DEFAULT_CONFIGS, type ReplaneConfigs} from '@/replane/types';
import {TRPCReactProvider} from '@/trpc/client';
import {HydrateClient} from '@/trpc/server';
import {ReplaneRoot} from '@replanejs/next';
import type {Metadata} from 'next';
import {Geist, Geist_Mono} from 'next/font/google';
import {Suspense} from 'react';
import {ErrorBoundary} from 'react-error-boundary';
import './globals.css';

export const dynamic = 'force-dynamic';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Replane',
  description: 'Replane application',
  icons: {
    icon: [
      {url: '/favicon.ico'},
      {url: '/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png'},
      {url: '/favicon/favicon-16x16.png', sizes: '16x16', type: 'image/png'},
    ],
    apple: '/favicon/apple-touch-icon.png',
    other: [{rel: 'manifest', url: '/favicon/site.webmanifest'}],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sentryConfig = {
    dsn: process.env.SENTRY_DSN || '',
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1',
  };

  return (
    <TRPCReactProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          {/* Inject Sentry config at runtime for client-side initialization */}
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__SENTRY_CONFIG__=${JSON.stringify(sentryConfig)};`,
            }}
          />
        </head>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <ReplaneRoot<ReplaneConfigs>
              options={{
                baseUrl: process.env.REPLANE_BASE_URL!,
                sdkKey: process.env.REPLANE_SDK_KEY!,
                defaults: DEFAULT_CONFIGS,
              }}
            >
              <AuthSession>
                <HydrateClient>
                  <ErrorBoundary FallbackComponent={ErrorFallback}>
                    <Suspense fallback={<DelayedFullscreenSpinner delay={1000} />}>
                      <BrowserOnly>{children}</BrowserOnly>
                    </Suspense>
                  </ErrorBoundary>
                </HydrateClient>
              </AuthSession>
            </ReplaneRoot>
            <Toaster
              toastOptions={{
                classNames: {
                  error: '!text-destructive ![&>svg]:text-destructive',
                  description: '!text-foreground',
                },
              }}
            />
          </ThemeProvider>
        </body>
      </html>
    </TRPCReactProvider>
  );
}
