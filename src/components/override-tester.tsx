'use client';

import {useProjectId} from '@/app/app/projects/[projectId]/utils';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Label} from '@/components/ui/label';
import type {Condition} from '@/engine/core/override-condition-schemas';
import type {EvaluationResult, Override} from '@/engine/core/override-evaluator';
import {evaluateConfigValue, renderOverrides} from '@/engine/core/override-evaluator';
import type {ConfigValue} from '@/engine/core/zod';
import {useTRPC} from '@/trpc/client';
import {useQueryClient, useSuspenseQuery} from '@tanstack/react-query';
import {CheckCircle2, ChevronRight, HelpCircle, PlayCircle, XCircle} from 'lucide-react';
import React, {useState} from 'react';
import {match} from 'ts-pattern';
import {ConditionEvaluationDebug} from './condition-evaluation-debug';
import {JsonEditor} from './json-editor';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from './ui/select';

interface OverrideTesterProps {
  baseValue: ConfigValue;
  overrides: Override[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OverrideTester({baseValue, overrides, open, onOpenChange}: OverrideTesterProps) {
  const [testResult, setTestResult] = useState<EvaluationResult | null>(null);

  // Extract properties from override conditions
  const extractedProperties = React.useMemo(() => {
    if (!overrides || overrides.length === 0) return new Set<string>();

    const properties = new Set<string>();

    const extractFromCondition = (cond: Condition) => {
      if ('property' in cond && cond.property) {
        properties.add(cond.property);
      }
      if ('conditions' in cond && Array.isArray(cond.conditions)) {
        cond.conditions.forEach((c: Condition) => extractFromCondition(c));
      }
      if ('condition' in cond && cond.condition) {
        extractFromCondition(cond.condition);
      }
    };

    overrides.forEach(override => {
      override.conditions.forEach(condition => extractFromCondition(condition));
    });

    return properties;
  }, [overrides]);

  // Initialize JSON with extracted properties
  const [contextJson, setContextJson] = useState(() => {
    const fields: Record<string, string> = {};
    extractedProperties.forEach(prop => {
      fields[prop] = '';
    });
    return Object.keys(fields).length > 0
      ? JSON.stringify(fields, null, 2)
      : '{\n  "userEmail": "",\n  "tier": ""\n}';
  });

  // Update JSON when overrides change
  React.useEffect(() => {
    if (open && extractedProperties.size > 0) {
      const fields: Record<string, string> = {};
      extractedProperties.forEach(prop => {
        fields[prop] = '';
      });
      setContextJson(JSON.stringify(fields, null, 2));
    }
  }, [open, extractedProperties]);

  // Reset test result when dialog opens or values change
  React.useEffect(() => {
    if (open) {
      setTestResult(null);
    }
  }, [open, baseValue, overrides]);

  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const configResolver = async (params: {
    projectId: string;
    configName: string;
    environmentId: string;
  }): Promise<ConfigValue | undefined> => {
    const config = await queryClient.fetchQuery(
      trpc.getConfig.queryOptions({projectId: params.projectId, name: params.configName}),
    );
    const variant =
      config.config?.variants.find(v => v.environmentId === params.environmentId) ??
      config.config?.variants.find(v => v.environmentId === null);

    if (!variant) {
      throw new Error(
        `No variant found for project ${params.projectId} and config ${params.configName} and environment ${params.environmentId}`,
      );
    }

    return variant.value;
  };

  const projectId = useProjectId();

  const environments = useSuspenseQuery(trpc.getProjectEnvironments.queryOptions({projectId}));

  if (environments.data.environments.length === 0) {
    throw new Error(`No environments found for project ${projectId}`);
  }

  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string>(
    environments.data.environments[0].id,
  );

  const handleTest = async () => {
    try {
      const context = JSON.parse(contextJson);
      if (typeof context !== 'object' || context === null) {
        alert('Context must be a JSON object');
        return;
      }

      // Render overrides (resolve references)
      const renderedOverrides = await renderOverrides({
        overrides,
        configResolver,
        environmentId: selectedEnvironmentId,
      });

      // Evaluate with debug information
      const result = evaluateConfigValue({value: baseValue, overrides: renderedOverrides}, context);

      setTestResult(result);
    } catch (error) {
      alert(`Invalid context: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (!overrides || overrides.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5 text-primary" />
            Test override conditions
          </DialogTitle>
          <DialogDescription>
            Input context values to see which override matches and what value would be returned
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium block mb-2">Environment</Label>
            <Select value={selectedEnvironmentId} onValueChange={setSelectedEnvironmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an environment" />
              </SelectTrigger>
              <SelectContent>
                {environments.data.environments.map(environment => (
                  <SelectItem key={environment.id} value={environment.id}>
                    {environment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm font-medium block mb-2">Context</Label>
            <p className="text-xs text-muted-foreground mb-3">
              Provide context properties to test how override conditions evaluate. Pre-filled with
              properties used in your conditions.
            </p>
            <JsonEditor
              id="override-test-context"
              editorName="Test Context"
              height={200}
              value={contextJson}
              onChange={setContextJson}
              aria-label="Test context JSON"
            />
          </div>

          <Button onClick={handleTest} className="w-full">
            <PlayCircle className="h-4 w-4 mr-2" />
            Test Evaluation
          </Button>

          {testResult && (
            <div className="space-y-4 pt-4 border-t">
              {/* Result Value */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">Returned Value</Label>
                <div className="rounded-lg border-2 bg-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {testResult.matchedOverride ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <Badge variant="default" className="text-xs">
                          Override: {testResult.matchedOverride.name}
                        </Badge>
                      </>
                    ) : (
                      <>
                        <Badge variant="outline" className="text-xs">
                          Base Value (no override matched)
                        </Badge>
                      </>
                    )}
                  </div>
                  <pre className="text-xs font-mono bg-muted/50 p-3 rounded overflow-auto max-h-40">
                    {JSON.stringify(testResult.finalValue, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Detailed Evaluation Results */}
              <div>
                <Label className="text-sm font-semibold mb-2 block">Evaluation Details</Label>
                <div className="space-y-3">
                  {testResult.overrideEvaluations.map((overrideEval, index) => (
                    <Collapsible key={index} defaultOpen={overrideEval.result !== 'matched'}>
                      <div
                        className={`rounded-lg border-2 ${match(overrideEval.result)
                          .with(
                            'matched',
                            () =>
                              'border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/10',
                          )
                          .with(
                            'unknown',
                            () =>
                              'border-yellow-200 dark:border-yellow-900 bg-yellow-50/50 dark:bg-yellow-950/10',
                          )
                          .with('not_matched', () => 'border-border bg-muted/30')
                          .exhaustive()}`}
                      >
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between p-3 hover:bg-muted/20">
                            <div className="flex items-center gap-2">
                              <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]_&]:rotate-90" />
                              {match(overrideEval.result)
                                .with('matched', () => (
                                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                ))
                                .with('not_matched', () => (
                                  <XCircle className="h-4 w-4 text-muted-foreground" />
                                ))
                                .with('unknown', () => (
                                  <HelpCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                                ))
                                .exhaustive()}
                              <span className="text-sm font-medium">
                                {overrideEval.override.name}
                              </span>
                              {testResult.matchedOverride === overrideEval.override && (
                                <Badge variant="default" className="text-xs">
                                  Winner
                                </Badge>
                              )}
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              {
                                overrideEval.conditionEvaluations.filter(
                                  r => r.result === 'matched',
                                ).length
                              }
                              /{overrideEval.conditionEvaluations.length} conditions matched
                            </Badge>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-3 pb-3 space-y-2 border-t pt-2">
                            {overrideEval.conditionEvaluations.map(
                              (conditionEval, conditionIdx) => (
                                <ConditionEvaluationDebug
                                  condition={conditionEval.condition}
                                  key={conditionIdx}
                                  evaluation={conditionEval}
                                />
                              ),
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
