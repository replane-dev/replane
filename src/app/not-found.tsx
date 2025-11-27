import {Button} from '@/components/ui/button';
import {FileQuestion, Home} from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="max-w-md w-full px-6 text-center space-y-8">
        <div className="flex justify-center">
          <div className="relative">
            <FileQuestion className="h-24 w-24 text-muted-foreground/40" strokeWidth={1.5} />
            <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full h-12 w-12 flex items-center justify-center text-xl font-bold">
              404
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">Page Not Found</h1>
          <p className="text-muted-foreground text-base">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild size="lg">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="https://replane.dev/docs" target="_blank">
              View Documentation
            </Link>
          </Button>
        </div>

        <div className="pt-8 border-t">
          <p className="text-sm text-muted-foreground">
            Need help?{' '}
            <Link
              href="https://github.com/replane-dev/replane/issues"
              target="_blank"
              className="text-primary hover:underline"
            >
              Contact support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
