'use client';

import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Label} from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {useTRPC} from '@/trpc/client';
import {useMutation, useQueryClient, useSuspenseQuery} from '@tanstack/react-query';
import {AlertCircle, ArrowRight, Check, FileJson, Globe, Upload} from 'lucide-react';
import * as React from 'react';
import {useDropzone} from 'react-dropzone';
import {toast} from 'sonner';

interface ImportConfigsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

interface Override {
  name: string;
  conditions: unknown[];
  value: unknown;
}

interface ImportedConfigVariant {
  environmentName: string;
  value: unknown;
  schema: unknown | null;
  useBaseSchema: boolean;
  overrides: Override[];
}

interface ImportedConfig {
  name: string;
  description: string;
  value: unknown;
  schema: unknown | null;
  overrides: Override[];
  variants: ImportedConfigVariant[];
}

interface ImportData {
  projectName: string;
  exportedAt: string;
  configs: ImportedConfig[];
}

interface EnvironmentMapping {
  sourceEnvironmentName: string;
  targetEnvironmentId: string;
}

type ImportStep = 'upload' | 'mapping' | 'confirm';

export function ImportConfigsDialog({open, onOpenChange, projectId}: ImportConfigsDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const {data: environmentsData} = useSuspenseQuery(
    trpc.getProjectEnvironments.queryOptions({projectId}),
  );
  const environments = environmentsData.environments;

  const importConfigs = useMutation(trpc.importProjectConfigs.mutationOptions());

  const [step, setStep] = React.useState<ImportStep>('upload');
  const [importData, setImportData] = React.useState<ImportData | null>(null);
  const [mappings, setMappings] = React.useState<EnvironmentMapping[]>([]);
  const [onConflict, setOnConflict] = React.useState<'skip' | 'replace'>('skip');
  const [importing, setImporting] = React.useState(false);
  const [parseError, setParseError] = React.useState<string | null>(null);

  const handleFile = React.useCallback(async (file: File) => {
    setParseError(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text) as ImportData;

      // Basic validation
      if (!data.configs || !Array.isArray(data.configs)) {
        throw new Error('Invalid file format: missing configs array');
      }

      if (data.configs.length === 0) {
        throw new Error('No configs found in the file');
      }

      setImportData(data);
      setStep('mapping');
    } catch (err: any) {
      setParseError(err.message ?? 'Failed to parse file');
    }
  }, []);

  const onDrop = React.useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  const {getRootProps, getInputProps, isDragActive} = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json'],
    },
    multiple: false,
  });

  // Extract unique environment names from the imported configs
  const sourceEnvironments = React.useMemo(() => {
    if (!importData) return [];
    const envSet = new Set<string>();
    for (const config of importData.configs) {
      for (const variant of config.variants) {
        envSet.add(variant.environmentName);
      }
    }
    return Array.from(envSet).sort();
  }, [importData]);

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setStep('upload');
      setImportData(null);
      setMappings([]);
      setOnConflict('skip');
      setParseError(null);
    }
  }, [open]);

  // Initialize mappings when import data is loaded
  React.useEffect(() => {
    if (importData && sourceEnvironments.length > 0) {
      const initialMappings: EnvironmentMapping[] = sourceEnvironments.map(sourceName => {
        // Try to find a matching target environment by name
        const matchingEnv = environments.find(
          e => e.name.toLowerCase() === sourceName.toLowerCase(),
        );
        return {
          sourceEnvironmentName: sourceName,
          targetEnvironmentId: matchingEnv?.id ?? '',
        };
      });
      setMappings(initialMappings);
    }
  }, [importData, sourceEnvironments, environments]);

  const handleMappingChange = (sourceEnvName: string, targetEnvId: string) => {
    setMappings(prev =>
      prev.map(m =>
        m.sourceEnvironmentName === sourceEnvName ? {...m, targetEnvironmentId: targetEnvId} : m,
      ),
    );
  };

  const canProceedToConfirm = mappings.every(m => m.targetEnvironmentId !== '');

  const handleImport = async () => {
    if (!importData) return;

    setImporting(true);
    try {
      const result = await importConfigs.mutateAsync({
        projectId,
        configs: importData.configs,
        environmentMappings: mappings.filter(m => m.targetEnvironmentId !== ''),
        onConflict,
      });

      // Invalidate config list query
      await queryClient.invalidateQueries({queryKey: trpc.getConfigList.queryKey({projectId})});

      toast.success(
        `Import complete: ${result.totalCreated} created, ${result.totalReplaced} replaced, ${result.totalSkipped} skipped`,
      );
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to import configs');
    }
    setImporting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Configs
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload a previously exported JSON file to import configs.'}
            {step === 'mapping' && 'Map source environments to target environments.'}
            {step === 'confirm' && 'Review and confirm the import.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 py-4">
            <div
              {...getRootProps()}
              className={`flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              }`}
            >
              <input {...getInputProps()} />
              <FileJson
                className={`h-12 w-12 transition-colors ${
                  isDragActive ? 'text-primary' : 'text-muted-foreground/50'
                }`}
              />
              <div>
                {isDragActive ? (
                  <p className="text-sm font-medium text-primary">Drop the file here</p>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      Drag and drop a file here, or click to select
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JSON file from a previous export
                    </p>
                  </>
                )}
              </div>
            </div>

            {parseError && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {parseError}
              </div>
            )}
          </div>
        )}

        {step === 'mapping' && importData && (
          <div className="space-y-4 py-4">
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <div className="font-medium">
                Importing {importData.configs.length} config
                {importData.configs.length !== 1 ? 's' : ''} from &ldquo;{importData.projectName}
                &rdquo;
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Exported on {new Date(importData.exportedAt).toLocaleString()}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Environment Mapping</Label>
              <p className="text-xs text-muted-foreground">
                Map each source environment to a target environment in this project.
              </p>

              {sourceEnvironments.length > 0 ? (
                <div className="space-y-2">
                  {mappings.map(mapping => (
                    <div
                      key={mapping.sourceEnvironmentName}
                      className="flex items-center gap-3 rounded-md border p-3"
                    >
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{mapping.sourceEnvironmentName}</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Select
                        value={mapping.targetEnvironmentId}
                        onValueChange={value =>
                          handleMappingChange(mapping.sourceEnvironmentName, value)
                        }
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select target environment" />
                        </SelectTrigger>
                        <SelectContent>
                          {environments.map(env => (
                            <SelectItem key={env.id} value={env.id}>
                              {env.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground italic">
                  No environment-specific variants found in the import file.
                </div>
              )}
            </div>

            <div className="space-y-3 pt-2">
              <Label className="text-sm font-medium">Conflict Resolution</Label>
              <p className="text-xs text-muted-foreground">
                What to do when a config with the same name already exists.
              </p>
              <Select
                value={onConflict}
                onValueChange={v => setOnConflict(v as 'skip' | 'replace')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip existing configs</SelectItem>
                  <SelectItem value="replace">Replace existing configs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 'confirm' && importData && (
          <div className="space-y-4 py-4">
            <div className="rounded-md bg-muted/50 p-3 text-sm space-y-2">
              <div className="font-medium">Ready to import</div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>
                  • {importData.configs.length} config{importData.configs.length !== 1 ? 's' : ''}
                </li>
                <li>
                  • {mappings.filter(m => m.targetEnvironmentId).length} environment mapping
                  {mappings.filter(m => m.targetEnvironmentId).length !== 1 ? 's' : ''}
                </li>
                <li>
                  • On conflict: {onConflict === 'skip' ? 'Skip existing' : 'Replace existing'}
                </li>
              </ul>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-md border">
              <div className="divide-y">
                {importData.configs.map(config => (
                  <div key={config.name} className="flex items-center gap-2 p-2 text-sm">
                    <Check className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-xs">{config.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}

          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button
                onClick={() => setStep('confirm')}
                disabled={!canProceedToConfirm && sourceEnvironments.length > 0}
              >
                Continue
              </Button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('mapping')} disabled={importing}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? 'Importing…' : 'Import'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
