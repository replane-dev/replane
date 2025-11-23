import {Badge} from '@/components/ui/badge';
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@/components/ui/collapsible';
import type {ConditionEvaluation, RenderedCondition} from '@/engine/core/override-evaluator';
import {AlertCircle, CheckCircle2, ChevronDown, ChevronRight, HelpCircle, Info} from 'lucide-react';
import {useState} from 'react';
import {match} from 'ts-pattern';

interface ConditionEvaluationDebugProps {
  condition: RenderedCondition;
  evaluation: ConditionEvaluation;
  depth?: number;
}

export function ConditionEvaluationDebug({
  condition,
  evaluation,
  depth = 0,
}: ConditionEvaluationDebugProps) {
  const [isExpanded, setIsExpanded] = useState(depth === 0);
  const hasNested = evaluation.nestedEvaluations && evaluation.nestedEvaluations.length > 0;
  const indent = depth * 16;

  return (
    <div style={{marginLeft: `${indent}px`}}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div
          className={`flex items-start gap-2 p-2 rounded-md ${match(evaluation.result)
            .with(
              'matched',
              () =>
                'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900',
            )
            .with(
              'not_matched',
              () => 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900',
            )
            .with(
              'unknown',
              () =>
                'bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900',
            )
            .exhaustive()}`}
        >
          {hasNested && (
            <CollapsibleTrigger asChild>
              <button className="shrink-0 hover:bg-background/50 rounded p-0.5">
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            </CollapsibleTrigger>
          )}
          {!hasNested && <div className="w-4 shrink-0" />}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {match(evaluation.result)
                .with('matched', () => (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                ))
                .with('not_matched', () => (
                  <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
                ))
                .with('unknown', () => (
                  <HelpCircle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 shrink-0" />
                ))
                .exhaustive()}

              <code className="text-xs font-mono bg-background/50 px-1.5 py-0.5 rounded">
                {condition.operator}
              </code>

              {'property' in condition && condition.property && (
                <>
                  <span className="text-xs text-muted-foreground">on</span>
                  <Badge variant="outline" className="text-xs font-mono">
                    {condition.property}
                  </Badge>
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-1">{evaluation.reason}</p>

            {evaluation.contextValue !== undefined && (
              <div className="text-xs mt-1 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Info className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Context value:</span>
                  <code className="bg-background/50 px-1 py-0.5 rounded font-mono">
                    {JSON.stringify(evaluation.contextValue)}
                  </code>
                </div>
              </div>
            )}
          </div>
        </div>

        {hasNested && (
          <CollapsibleContent className="space-y-1 mt-1">
            {evaluation.nestedEvaluations!.map((nested: ConditionEvaluation, idx: number) => (
              <ConditionEvaluationDebug
                key={idx}
                evaluation={nested}
                depth={depth + 1}
                condition={nested.condition}
              />
            ))}
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
}
