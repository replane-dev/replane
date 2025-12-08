import {AuthSession} from '@/components/auth-session';
import {BrowserOnly} from '@/components/browser-only';
import {ErrorFallback} from '@/components/error-fallback';
import {DelayedFullscreenSpinner} from '@/components/spinner';
import {ThemeProvider} from '@/components/theme-provider';
import {Toaster} from '@/components/ui/sonner';
import {TRPCReactProvider} from '@/trpc/client';
import {HydrateClient} from '@/trpc/server';
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <TRPCReactProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <AuthSession>
              <HydrateClient>
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                  <Suspense fallback={<DelayedFullscreenSpinner delay={1000} />}>
                    <BrowserOnly>{children}</BrowserOnly>
                  </Suspense>
                </ErrorBoundary>
              </HydrateClient>
            </AuthSession>
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
