import {Book, ExternalLink, Github} from 'lucide-react';
import Link from 'next/link';
import {ReplaneIcon} from './replane-icon';
import {Card, CardContent, CardHeader, CardTitle} from './ui/card';

export function UsefulLinks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Useful Links</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          <a
            href="https://replane.dev/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <Book className="size-5 text-muted-foreground" />
              <div>
                <div className="font-medium">Documentation</div>
                <div className="text-sm text-muted-foreground">Learn how to use Replane</div>
              </div>
            </div>
            <ExternalLink className="size-4 text-muted-foreground" />
          </a>
          <a
            href="https://github.com/replane-dev/replane"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <Github className="size-5 text-muted-foreground" />
              <div>
                <div className="font-medium">GitHub</div>
                <div className="text-sm text-muted-foreground">
                  View source code and report issues
                </div>
              </div>
            </div>
            <ExternalLink className="size-4 text-muted-foreground" />
          </a>
          <Link
            href="/auth/signin"
            className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-3">
              <ReplaneIcon className="size-5 text-muted-foreground" />
              <div>
                <div className="font-medium">Sign In</div>
                <div className="text-sm text-muted-foreground">Access your Replane dashboard</div>
              </div>
            </div>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
