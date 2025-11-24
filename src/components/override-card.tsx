'use client';

import {JsonEditor} from '@/components/json-editor';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import type {Condition} from '@/engine/core/override-condition-schemas';
import type {Override} from '@/engine/core/override-evaluator';
import {ChevronDown, ChevronRight, CircleHelp, Code2, LayoutGrid, Plus, Trash2} from 'lucide-react';
import React, {useCallback, useState} from 'react';
import {ConditionEditor} from './condition-editor';

interface OverrideCardProps {
  override: Override;
  index: number;
  readOnly?: boolean;
  schema?: any;
  projectId?: string;
  onUpdate: (updatedOverride: Override) => void;
  onRemove: () => void;
}

const OverrideCardComponent = ({
  override,
  index,
  readOnly,
  schema,
  projectId,
  onUpdate,
  onRemove,
}: OverrideCardProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<'form' | 'json'>('form');

  // Local JSON state for editing (only while in JSON view)
  const [localJsonValue, setLocalJsonValue] = useState('');

  // When switching to JSON view, initialize local JSON
  const prevViewModeRef = React.useRef(viewMode);
  React.useEffect(() => {
    if (prevViewModeRef.current === 'form' && viewMode === 'json') {
      setLocalJsonValue(JSON.stringify(override, null, 2));
    }
    prevViewModeRef.current = viewMode;
  }, [viewMode, override]);

  const handleJsonChange = useCallback(
    (newJson: string) => {
      // Update local state for smooth editing
      setLocalJsonValue(newJson);

      // Only update parent if JSON is valid
      try {
        const parsed = JSON.parse(newJson);
        onUpdate({
          name: parsed.name ?? override.name,
          conditions: parsed.conditions ?? override.conditions,
          value: parsed.value ?? override.value,
        });
      } catch {
        // Invalid JSON - don't update parent, user still typing
      }
    },
    [override, onUpdate],
  );

  const handleAddCondition = useCallback(() => {
    onUpdate({
      ...override,
      conditions: [
        ...override.conditions,
        {
          operator: 'equals',
          property: '',
          value: {type: 'literal', value: ''},
        },
      ],
    });
  }, [override, onUpdate]);

  const handleUpdateCondition = useCallback(
    (conditionIndex: number, condition: Condition) => {
      const newConditions = [...override.conditions];
      newConditions[conditionIndex] = condition;
      onUpdate({
        ...override,
        conditions: newConditions,
      });
    },
    [override, onUpdate],
  );

  const handleRemoveCondition = useCallback(
    (conditionIndex: number) => {
      onUpdate({
        ...override,
        conditions: override.conditions.filter((_, i) => i !== conditionIndex),
      });
    },
    [override, onUpdate],
  );

  return (
    <Tabs
      value={viewMode}
      onValueChange={v => setViewMode(v as 'form' | 'json')}
      className="w-full"
    >
      <div className="rounded-lg border-2 bg-card shadow-sm">
        {/* Header */}
        <div
          className="flex items-center gap-2 p-3 border-b bg-muted/30 cursor-pointer hover:bg-muted/50"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={e => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
          <Badge variant="outline" className="shrink-0 font-mono text-xs">
            #{index + 1}
          </Badge>
          <Input
            value={override.name}
            onChange={e => {
              e.stopPropagation();
              onUpdate({...override, name: e.target.value});
            }}
            onClick={e => e.stopPropagation()}
            disabled={readOnly}
            className="flex-1 font-semibold h-8 border-0 bg-transparent focus-visible:ring-1"
            placeholder="Override name"
          />
          <TabsList className="h-8 shrink-0" onClick={e => e.stopPropagation()}>
            <TabsTrigger value="form" className="h-7 text-xs px-2">
              <LayoutGrid className="h-3 w-3 mr-1" />
              Form
            </TabsTrigger>
            <TabsTrigger value="json" className="h-7 text-xs px-2">
              <Code2 className="h-3 w-3 mr-1" />
              JSON
            </TabsTrigger>
          </TabsList>
          {!readOnly && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={e => {
                    e.stopPropagation();
                    onRemove();
                  }}
                  className="shrink-0 hover:bg-destructive/10 hover:text-destructive h-8 w-8 p-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Delete this override</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {isExpanded && (
          <div className="p-4">
            <TabsContent value="form" className="mt-0 space-y-4">
              {/* Override Value */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor={`override-value-${index}`} className="text-sm font-semibold">
                    Override Value
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CircleHelp className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        The value to return when all conditions below match. Must be valid JSON.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <JsonEditor
                  id={`override-value-${index}`}
                  height={180}
                  value={JSON.stringify(override.value, null, 2)}
                  onChange={(value: string) => {
                    try {
                      const parsed = JSON.parse(value);
                      onUpdate({...override, value: parsed});
                    } catch {
                      // Keep current value if parsing fails
                    }
                  }}
                  schema={schema}
                  readOnly={readOnly}
                />
              </div>

              {/* Conditions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-sm font-semibold">Conditions</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CircleHelp className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">
                          All conditions must be true for this override to apply. Define conditions
                          based on context properties.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {override.conditions.length}{' '}
                    {override.conditions.length === 1 ? 'condition' : 'conditions'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {override.conditions.map((condition, conditionIndex) => (
                    <ConditionEditor
                      key={conditionIndex}
                      condition={condition}
                      onChange={c => handleUpdateCondition(conditionIndex, c)}
                      onRemove={() => handleRemoveCondition(conditionIndex)}
                      readOnly={readOnly}
                      projectId={projectId}
                    />
                  ))}
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddCondition}
                      className="w-full h-9"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Condition
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* JSON View */}
            <TabsContent value="json" className="mt-0">
              <JsonEditor
                id={`override-json-${index}`}
                height={400}
                value={viewMode === 'json' ? localJsonValue : JSON.stringify(override, null, 2)}
                onChange={handleJsonChange}
                aria-label={`Override ${index + 1} JSON`}
                readOnly={readOnly}
              />
            </TabsContent>
          </div>
        )}
      </div>
    </Tabs>
  );
};

// Memoize to prevent re-renders when props haven't changed
export const OverrideCard = React.memo(OverrideCardComponent);
