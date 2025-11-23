'use client';

import {JsonEditor} from '@/components/json-editor';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import {ChevronDown, ChevronRight, CircleHelp, Code2, LayoutGrid, Plus, Trash2} from 'lucide-react';
import {useState} from 'react';
import type {Condition} from '@/engine/core/override-evaluator';
import type {Override} from './override-builder';
import {ConditionEditor} from './condition-editor';

interface OverrideCardProps {
  override: Override;
  index: number;
  isExpanded: boolean;
  viewMode: 'form' | 'json';
  readOnly?: boolean;
  schema?: any;
  onToggleExpand: () => void;
  onViewModeChange: (mode: 'form' | 'json') => void;
  onUpdate: (field: keyof Override, value: any) => void;
  onRemove: () => void;
  onAddCondition: () => void;
  onUpdateCondition: (conditionIndex: number, condition: Condition) => void;
  onRemoveCondition: (conditionIndex: number) => void;
}

export function OverrideCard({
  override,
  index,
  isExpanded,
  viewMode,
  readOnly,
  schema,
  onToggleExpand,
  onViewModeChange,
  onUpdate,
  onRemove,
  onAddCondition,
  onUpdateCondition,
  onRemoveCondition,
}: OverrideCardProps) {
  return (
    <Tabs value={viewMode} onValueChange={v => onViewModeChange(v as 'form' | 'json')}>
      <div className="rounded-lg border-2 bg-card shadow-sm">
        {/* Header */}
        <div
          className="flex items-center gap-2 p-3 border-b bg-muted/30 cursor-pointer hover:bg-muted/50"
          onClick={onToggleExpand}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={e => {
              e.stopPropagation();
              onToggleExpand();
            }}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          <Badge variant="outline" className="shrink-0 font-mono text-xs">
            #{index + 1}
          </Badge>
          <Input
            value={override.name}
            onChange={e => {
              e.stopPropagation();
              onUpdate('name', e.target.value);
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
                      onUpdate('value', parsed);
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
                          All conditions must be true for this override to apply. Define conditions based
                          on context properties.
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
                      onChange={c => onUpdateCondition(conditionIndex, c)}
                      onRemove={() => onRemoveCondition(conditionIndex)}
                      readOnly={readOnly}
                    />
                  ))}
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onAddCondition}
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
                value={JSON.stringify(override, null, 2)}
                onChange={(value: string) => {
                  try {
                    const parsed = JSON.parse(value);
                    if (parsed.name) onUpdate('name', parsed.name);
                    if (parsed.conditions) onUpdate('conditions', parsed.conditions);
                    if (parsed.value !== undefined) onUpdate('value', parsed.value);
                  } catch {
                    // Invalid JSON, don't update
                  }
                }}
                aria-label={`Override ${index + 1} JSON`}
                readOnly={readOnly}
              />
            </TabsContent>
          </div>
        )}
      </div>
    </Tabs>
  );
}

