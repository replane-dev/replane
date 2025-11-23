'use client';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {ScrollArea} from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip';
import type {Condition} from '@/engine/core/override-evaluator';
import {ChevronDown, ChevronRight, CircleHelp, Plus, Trash2} from 'lucide-react';
import {useState} from 'react';

interface ConditionEditorProps {
  condition: Condition;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
  readOnly?: boolean;
  depth?: number;
}

const operatorLabels: Record<string, string> = {
  equals: 'Equals',
  in: 'In (list)',
  not_in: 'Not In (list)',
  less_than: 'Less Than (<)',
  less_than_or_equal: 'Less Than or Equal (<=)',
  greater_than: 'Greater Than (>)',
  greater_than_or_equal: 'Greater Than or Equal (>=)',
  segmentation: 'Segmentation (%)',
  not: 'NOT (invert)',
  and: 'AND (all must match)',
  or: 'OR (any can match)',
};

const operatorDescriptions: Record<string, string> = {
  equals: 'Property must exactly match the value',
  in: 'Property must be in the array of values',
  not_in: 'Property must not be in the array of values',
  less_than: 'Property must be less than the value (numbers or strings)',
  less_than_or_equal: 'Property must be less than or equal to the value (numbers or strings)',
  greater_than: 'Property must be greater than the value (numbers or strings)',
  greater_than_or_equal: 'Property must be greater than or equal to the value (numbers or strings)',
  segmentation: 'Deterministically segments users by percentage using hash-based bucketing',
  not: 'Inverts the nested condition result',
  and: 'All nested conditions must be true',
  or: 'At least one nested condition must be true',
};

// Generate a random salt for segmentation
function generateSalt(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function ConditionEditor({
  condition,
  onChange,
  onRemove,
  readOnly,
  depth = 0,
}: ConditionEditorProps) {
  const isComposite =
    condition.operator === 'and' || condition.operator === 'or' || condition.operator === 'not';
  const [isExpanded, setIsExpanded] = useState(true);

  const handleAddSubcondition = () => {
    if (condition.operator === 'and' || condition.operator === 'or') {
      const newCondition: Condition = {
        operator: 'equals',
        property: '',
        value: '',
      };
      onChange({
        ...condition,
        conditions: [...condition.conditions, newCondition],
      });
    }
  };

  const handleUpdateSubcondition = (index: number, newCondition: Condition) => {
    if (condition.operator === 'and' || condition.operator === 'or') {
      const updated = [...condition.conditions];
      updated[index] = newCondition;
      onChange({...condition, conditions: updated});
    } else if (condition.operator === 'not') {
      onChange({...condition, condition: newCondition});
    }
  };

  const handleRemoveSubcondition = (index: number) => {
    if (condition.operator === 'and' || condition.operator === 'or') {
      const updated = condition.conditions.filter((_, i) => i !== index);
      onChange({...condition, conditions: updated});
    }
  };

  return (
    <div className="space-y-2">
      <div className={`p-3 rounded-lg border-2 ${isComposite ? 'bg-muted/30' : 'bg-background'}`}>
        {/* Property-based conditions */}
        {!isComposite && (
          <div className="space-y-2">
            {/* Property | Operator | Value row */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <div className="flex items-center gap-1 mb-1">
                  <Label className="text-xs font-medium">Property</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CircleHelp className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">
                        The context property to evaluate. Examples: userEmail, tier, country, userId
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  className="h-9 text-xs w-full"
                  value={'property' in condition ? condition.property : ''}
                  onChange={e => {
                    if ('property' in condition) {
                      onChange({...condition, property: e.target.value});
                    }
                  }}
                  disabled={readOnly}
                  placeholder="userEmail, tier..."
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1 mb-1">
                  <Label className="text-xs font-medium">Operator</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CircleHelp className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">
                        {operatorDescriptions[condition.operator] || 'Select an operator'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={condition.operator}
                  onValueChange={value => {
                    const newOperator = value as Condition['operator'];

                    if (newOperator === 'and' || newOperator === 'or') {
                      onChange({operator: newOperator, conditions: []} as Condition);
                    } else if (newOperator === 'not') {
                      onChange({
                        operator: 'not',
                        condition: {operator: 'equals', property: '', value: ''},
                      } as Condition);
                    } else if (newOperator === 'segmentation') {
                      onChange({
                        operator: 'segmentation',
                        property: 'property' in condition ? condition.property : '',
                        percentage: 50,
                        salt: generateSalt(),
                      });
                    } else {
                      onChange({
                        operator: newOperator,
                        property: 'property' in condition ? condition.property : '',
                        value: 'value' in condition ? condition.value : '',
                      } as Condition);
                    }
                  }}
                  disabled={readOnly}
                >
                  <SelectTrigger className="h-9 text-xs w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(operatorLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Value column - show for simple comparison operators */}
              {condition.operator !== 'in' &&
                condition.operator !== 'not_in' &&
                condition.operator !== 'segmentation' &&
                'value' in condition && (
                  <div className="flex-1">
                    <div className="flex items-center gap-1 mb-1">
                      <Label className="text-xs font-medium">Value</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <CircleHelp className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-xs">
                            The value to compare against. Can be a string, number, or boolean.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      className="h-9 text-xs font-mono w-full"
                      value={
                        'value' in condition
                          ? typeof condition.value === 'string'
                            ? condition.value
                            : JSON.stringify(condition.value)
                          : ''
                      }
                      onChange={e => {
                        if ('value' in condition) {
                          onChange({...condition, value: e.target.value});
                        }
                      }}
                      disabled={readOnly}
                      placeholder={`premium, 100, true...`}
                    />
                  </div>
                )}

              {/* Percentage column - only for segmentation */}
              {condition.operator === 'segmentation' && 'percentage' in condition && (
                <div className="flex-1">
                  <div className="flex items-center gap-1 mb-1">
                    <Label className="text-xs font-medium">Percentage</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CircleHelp className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs">
                          Percentage of users to include (0-100). Uses consistent hash-based
                          bucketing.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    className="h-9 text-xs font-mono w-full"
                    value={condition.percentage}
                    onChange={e => {
                      const percentage = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      onChange({...condition, percentage});
                    }}
                    disabled={readOnly}
                    placeholder="50"
                  />
                </div>
              )}

              {!readOnly && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onRemove}
                      className="h-9 w-9 p-0 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Delete this condition</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Multi-value input for in/not_in - shown below */}
            {(condition.operator === 'in' || condition.operator === 'not_in') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Values</Label>
                  <Badge variant="secondary" className="text-xs">
                    {(() => {
                      const values = Array.isArray(condition.value) ? condition.value : [];
                      return `${values.length} ${values.length === 1 ? 'value' : 'values'}`;
                    })()}
                  </Badge>
                </div>
                <div className="rounded-lg border bg-muted/30 p-2">
                  <ScrollArea className="h-40">
                    <div className="space-y-1.5 pr-3">
                      {(() => {
                        const values = Array.isArray(condition.value) ? condition.value : [];

                        if (values.length === 0) {
                          return (
                            <div className="text-center py-3 text-xs text-muted-foreground">
                              No values added yet
                            </div>
                          );
                        }

                        return values.map((val: unknown, idx: number) => (
                          <div key={idx} className="flex gap-1.5 items-center">
                            <Badge
                              variant="outline"
                              className="shrink-0 font-mono text-xs w-6 justify-center"
                            >
                              {idx + 1}
                            </Badge>
                            <Input
                              className="h-8 text-xs font-mono flex-1"
                              value={typeof val === 'string' ? val : JSON.stringify(val)}
                              onChange={e => {
                                const newValues = [...values];
                                newValues[idx] = e.target.value;
                                onChange({...condition, value: newValues});
                              }}
                              disabled={readOnly}
                              placeholder={`Value ${idx + 1}`}
                            />
                            {!readOnly && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newValues = values.filter((_, i) => i !== idx);
                                      onChange({
                                        ...condition,
                                        value: newValues.length > 0 ? newValues : [],
                                      });
                                    }}
                                    className="h-8 w-8 p-0 shrink-0 hover:bg-destructive/10 hover:text-destructive"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p className="text-xs">Remove this value</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        ));
                      })()}
                    </div>
                  </ScrollArea>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const values = Array.isArray(condition.value) ? condition.value : [];
                        const newValues = [...values, ''];
                        onChange({...condition, value: newValues});
                      }}
                      className="w-full h-8 text-xs mt-2"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add Value
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Composite conditions */}
        {isComposite && (
          <div className="space-y-3">
            <div className="flex gap-2 items-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="h-9 w-9 p-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{isExpanded ? 'Collapse' : 'Expand'}</p>
                </TooltipContent>
              </Tooltip>
              <div className="flex-1">
                <div className="flex items-center gap-1 mb-1">
                  <Label className="text-xs font-medium">Operator</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CircleHelp className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">
                        {operatorDescriptions[condition.operator] || 'Select an operator'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={condition.operator}
                  onValueChange={value => {
                    const newOperator = value as Condition['operator'];

                    if (newOperator === 'and' || newOperator === 'or') {
                      // Preserve existing conditions when switching between and/or
                      const existingConditions =
                        condition.operator === 'and' || condition.operator === 'or'
                          ? condition.conditions
                          : condition.operator === 'not'
                            ? [condition.condition]
                            : [];
                      onChange({
                        operator: newOperator,
                        conditions: existingConditions,
                      } as Condition);
                    } else if (newOperator === 'not') {
                      // For NOT, preserve first condition or create a new one
                      const firstCondition =
                        condition.operator === 'and' || condition.operator === 'or'
                          ? condition.conditions[0] || {operator: 'equals', property: '', value: ''}
                          : condition.operator === 'not'
                            ? condition.condition
                            : {operator: 'equals', property: '', value: ''};
                      onChange({
                        operator: 'not',
                        condition: firstCondition,
                      } as Condition);
                    } else {
                      onChange({
                        operator: newOperator,
                        property: '',
                        value: '',
                      } as Condition);
                    }
                  }}
                  disabled={readOnly}
                >
                  <SelectTrigger className="h-9 text-xs w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(operatorLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!readOnly && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onRemove}
                      className="h-9 w-9 p-0 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Delete this condition</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {isExpanded && (
              <div className="ml-8 space-y-2 border-l-2 pl-3">
                {condition.operator === 'not' ? (
                  <ConditionEditor
                    condition={condition.condition}
                    onChange={newCondition => handleUpdateSubcondition(0, newCondition)}
                    onRemove={() => {
                      /* NOT operator must have a condition */
                    }}
                    readOnly={readOnly}
                    depth={depth + 1}
                  />
                ) : (
                  <>
                    {(condition.conditions || []).map((subcondition, index) => (
                      <ConditionEditor
                        key={index}
                        condition={subcondition}
                        onChange={newCondition => handleUpdateSubcondition(index, newCondition)}
                        onRemove={() => handleRemoveSubcondition(index)}
                        readOnly={readOnly}
                        depth={depth + 1}
                      />
                    ))}
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddSubcondition}
                        className="w-full h-8 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Add {condition.operator.toUpperCase()} Condition
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
