'use client';

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
import type {Condition, OverrideEvaluation} from '@/engine/core/override-evaluator';
import {evaluateConfigValue} from '@/engine/core/override-evaluator';
import {CheckCircle2, ChevronRight, PlayCircle, XCircle} from 'lucide-react';
import React, {useState} from 'react';
import {ConditionEvaluationDebug} from './condition-evaluation-debug';
import {JsonEditor} from './json-editor';
import type {Override} from './override-builder';

interface OverrideTesterProps {
  baseValue: any;
  overrides: Override[] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OverrideTester({baseValue, overrides, open, onOpenChange}: OverrideTesterProps) {
  const [testResult, setTestResult] = useState<{
    finalValue: any;
    matchedOverride: Override | null;
    overrideEvaluations: OverrideEvaluation[];
  } | null>(null);

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

  const handleTest = () => {
    try {
      const context = JSON.parse(contextJson);
      if (typeof context !== 'object' || context === null) {
        alert('Context must be a JSON object');
        return;
      }

      // Evaluate with debug information
      const config = {value: baseValue, overrides};
      const result = evaluateConfigValue(config, context);

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
            Test Override Conditions
          </DialogTitle>
          <DialogDescription>
            Input context values to see which override matches and what value would be returned
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium block mb-2">Context</Label>
            <p className="text-xs text-muted-foreground mb-3">
              Provide context properties to test how override conditions evaluate. Pre-filled with
              properties used in your conditions.
            </p>
            <JsonEditor
              id="override-test-context"
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
                    <Collapsible key={index} defaultOpen={!overrideEval.matched}>
                      <div
                        className={`rounded-lg border-2 ${
                          overrideEval.matched
                            ? 'border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/10'
                            : 'border-border bg-muted/30'
                        }`}
                      >
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between p-3 hover:bg-muted/20">
                            <div className="flex items-center gap-2">
                              <ChevronRight className="h-4 w-4 transition-transform [[data-state=open]_&]:rotate-90" />
                              {overrideEval.matched ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                              ) : (
                                <XCircle className="h-4 w-4 text-muted-foreground" />
                              )}
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
                              {overrideEval.conditionEvaluations.filter(r => r.matched).length}/
                              {overrideEval.conditionEvaluations.length} conditions matched
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
