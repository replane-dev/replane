import {AlertTriangle} from 'lucide-react';

export function SchemaDiffWarning() {
  return (
    <div className="rounded-lg border border-yellow-200/50 bg-yellow-50/50 dark:border-yellow-900/30 dark:bg-yellow-950/20 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground mb-1">
            Different schemas across environments
          </div>
          <p className="text-sm text-foreground/80 dark:text-foreground/70">
            Your environments have different JSON schemas enabled. This can lead to inconsistencies
            across environments. Consider using the same schema across all environments.
          </p>
        </div>
      </div>
    </div>
  );
}
