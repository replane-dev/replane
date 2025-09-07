import {AuthSession} from '@/components/auth-session';
import {Toaster} from '@/components/ui/sonner';
import {TRPCReactProvider} from '@/trpc/client';
import type {Metadata} from 'next';
import {Geist, Geist_Mono} from 'next/font/google';
import './globals.css';

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
      <html lang="en">
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <AuthSession>{children}</AuthSession>
          <Toaster
            toastOptions={{
              classNames: {
                error: '!text-destructive ![&>svg]:text-destructive',
              },
            }}
          />
        </body>
      </html>
    </TRPCReactProvider>
  );
}
