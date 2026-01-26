'use client';

import {CodeSnippet} from '@/components/code-snippet';
import {ReferenceValuePreviewDialog} from '@/components/reference-value-preview-dialog';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Help} from '@/components/ui/help';
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
import {formatJsonPath, getValueByPath, parseJsonPath} from '@/engine/core/json-path';
import type {Condition} from '@/engine/core/override-condition-schemas';
import {parseJsonc} from '@/engine/core/utils';
import {useDebounce} from '@/hooks/use-debounce';
import {useTRPC} from '@/trpc/client';
import {useQueryClient} from '@tanstack/react-query';
import {ChevronDown, ChevronRight, Eye, Link2, Link2Off, Plus, Trash2} from 'lucide-react';
import Link from 'next/link';
import {useEffect, useState} from 'react';

interface ConditionEditorProps {
  condition: Condition;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
  readOnly?: boolean;
  depth?: number;
  projectId?: string;
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
  segmentation: 'Deterministically segments users into buckets (0-100) using hash-based bucketing',
  not: 'Inverts the nested condition result',
  and: 'All nested conditions must be true',
  or: 'At least one nested condition must be true',
};

// Generate a random seed for segmentation
function generateSeed(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function ConditionEditor({
  condition,
  onChange,
  onRemove,
  readOnly,
  depth = 0,
  projectId,
}: ConditionEditorProps) {
  const isComposite =
    condition.operator === 'and' || condition.operator === 'or' || condition.operator === 'not';
  const [isExpanded, setIsExpanded] = useState(true);
  const [showReferenceModal, setShowReferenceModal] = useState(false);
  const [tempConfigName, setTempConfigName] = useState('');
  const [tempPath, setTempPath] = useState('');
  const [previewValue, setPreviewValue] = useState<{
    loading: boolean;
    value?: unknown;
    error?: string;
  }>({
    loading: false,
  });
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);

  const queryClient = useQueryClient();
  const trpc = useTRPC();

  // Track reference validation state
  const [referenceValidation, setReferenceValidation] = useState<{
    valid: boolean;
    checking: boolean;
    error?: string;
  }>({valid: true, checking: false});

  // Debounce the config name and path for auto-preview
  const debouncedConfigName = useDebounce(tempConfigName, 500);
  const debouncedPath = useDebounce(tempPath, 500);

  // Auto-preview when modal is open and values change
  useEffect(() => {
    if (showReferenceModal) {
      if (debouncedConfigName.trim()) {
        handlePreview(debouncedConfigName, debouncedPath);
      } else {
        // Reset preview when config name is empty
        setPreviewValue({loading: false});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReferenceModal, debouncedConfigName, debouncedPath]);

  // Reset preview when dialog closes
  useEffect(() => {
    if (!showReferenceModal) {
      setPreviewValue({loading: false});
    }
  }, [showReferenceModal]);

  // Eagerly validate reference in condition editor
  useEffect(() => {
    if (!isComposite && 'value' in condition && condition.value.type === 'reference') {
      const reference = condition.value;

      if (!projectId || !reference.configName.trim()) {
        setReferenceValidation({valid: false, checking: false, error: 'Missing config name'});
        return;
      }

      setReferenceValidation({valid: true, checking: true});

      const validate = async () => {
        try {
          const config = await queryClient.fetchQuery(
            trpc.getConfig.queryOptions({projectId, name: reference.configName.trim()}),
          );

          if (!config?.config) {
            setReferenceValidation({valid: false, checking: false, error: 'Config not found'});
            return;
          }

          // TODO: use the same environment as the current variant
          // Use Production variant or first variant
          const variant = config.config.config;

          if (!variant) {
            setReferenceValidation({valid: false, checking: false, error: 'No variants found'});
            return;
          }

          const resolvedValue =
            reference.path.length > 0
              ? getValueByPath(parseJsonc(variant.value), reference.path)
              : parseJsonc(variant.value);

          if (resolvedValue === undefined) {
            setReferenceValidation({
              valid: false,
              checking: false,
              error:
                reference.path.length > 0
                  ? `Path not found in config`
                  : 'Config value is undefined',
            });
            return;
          }

          setReferenceValidation({valid: true, checking: false});
        } catch (error) {
          console.error(error);
          setReferenceValidation({
            valid: false,
            checking: false,
            error: 'Unable to load config — please try again',
          });
        }
      };

      // Debounce validation to avoid too many requests
      const timeoutId = setTimeout(validate, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setReferenceValidation({valid: true, checking: false});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComposite, 'value' in condition ? condition.value : null, projectId]);

  const handleAddSubcondition = () => {
    if (condition.operator === 'and' || condition.operator === 'or') {
      const newCondition: Condition = {
        operator: 'equals',
        property: '',
        value: {type: 'literal', value: ''},
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

  const handlePreview = async (configName: string, path: string) => {
    if (!projectId || !configName.trim()) {
      setPreviewValue({loading: false});
      return;
    }

    setPreviewValue({loading: true});
    try {
      const config = await queryClient.fetchQuery(
        trpc.getConfig.queryOptions({projectId, name: configName.trim()}),
      );

      if (!config?.config) {
        setPreviewValue({loading: false, error: 'Config not found'});
        return;
      }

      // Use Production variant or first variant
      const variant = config.config.config;

      if (!variant) {
        setPreviewValue({loading: false, error: 'No variants found'});
        return;
      }

      const parsedPath = path.trim() ? parseJsonPath(path.trim()) : [];
      const resolvedValue =
        parsedPath.length > 0
          ? getValueByPath(parseJsonc(variant.value), parsedPath)
          : parseJsonc(variant.value);

      // Check if the resolved value is undefined (bad reference/path)
      if (resolvedValue === undefined) {
        setPreviewValue({
          loading: false,
          error:
            parsedPath.length > 0
              ? `Path "${formatJsonPath(parsedPath)}" not found in config`
              : 'Config value is undefined',
        });
        return;
      }

      setPreviewValue({loading: false, value: resolvedValue});
    } catch (error) {
      setPreviewValue({
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to load config — please try again',
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className={`p-3 rounded-lg border ${isComposite ? 'bg-muted/30' : 'bg-background'}`}>
        {/* Property-based conditions */}
        {!isComposite && (
          <div className="space-y-2">
            {/* Property | Operator | Value row */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <div className="flex items-center gap-1 mb-1">
                  <Label className="text-xs font-medium">Property</Label>
                  <Help>
                    <p className="text-xs">
                      {condition.operator === 'segmentation'
                        ? 'The context property to hash for bucketing. Use userId or sessionId to ensure each user gets consistent bucket assignment (same user always in same bucket).'
                        : 'The context property to evaluate. Examples: userEmail, tier, country, userId'}
                    </p>
                  </Help>
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
                  <Help>
                    <p className="text-xs">
                      {operatorDescriptions[condition.operator] || 'Select an operator'}
                    </p>
                  </Help>
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
                        condition: {
                          operator: 'equals',
                          property: '',
                          value: {type: 'literal', value: ''},
                        },
                      } as Condition);
                    } else if (newOperator === 'segmentation') {
                      onChange({
                        operator: 'segmentation',
                        property: 'property' in condition ? condition.property : '',
                        fromPercentage: 0,
                        toPercentage: 50,
                        seed: generateSeed(),
                      });
                    } else {
                      onChange({
                        operator: newOperator,
                        property: 'property' in condition ? condition.property : '',
                        value:
                          'value' in condition ? condition.value : {type: 'literal', value: ''},
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

              {/* Value column - show for all operators except segmentation */}
              {condition.operator !== 'segmentation' && 'value' in condition && (
                <div className="flex-2">
                  <div className="flex items-center gap-1 mb-1">
                    <Label className="text-xs font-medium">
                      {condition.operator === 'in' || condition.operator === 'not_in'
                        ? 'Values'
                        : 'Value'}
                    </Label>
                    <Help>
                      <p className="text-xs">
                        {condition.operator === 'in' || condition.operator === 'not_in'
                          ? 'List of values or reference to an array in another config'
                          : 'The value to compare against. Can be a literal value or a reference to another config'}
                      </p>
                    </Help>
                  </div>
                  {condition.value.type === 'literal' ? (
                    condition.operator === 'in' || condition.operator === 'not_in' ? (
                      /* Multi-value button that opens the list below */
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 w-full justify-start font-mono text-xs"
                        onClick={() => {}}
                        disabled={readOnly}
                      >
                        {(() => {
                          const values = Array.isArray(condition.value.value)
                            ? condition.value.value
                            : [];
                          return values.length === 0
                            ? 'No values'
                            : `${values.length} ${values.length === 1 ? 'value' : 'values'}`;
                        })()}
                      </Button>
                    ) : (
                      <Input
                        className="h-9 text-xs font-mono w-full"
                        value={
                          typeof condition.value.value === 'string'
                            ? condition.value.value
                            : JSON.stringify(condition.value.value)
                        }
                        onChange={e => {
                          onChange({
                            ...condition,
                            value: {type: 'literal', value: e.target.value},
                          });
                        }}
                        disabled={readOnly}
                        placeholder={`premium, 100, true...`}
                      />
                    )
                  ) : (
                    /* Reference display - same for all operators */
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex items-center gap-1.5 h-9 px-3 rounded-md border ${
                            !referenceValidation.valid
                              ? 'border-destructive/50 bg-destructive/10'
                              : 'bg-muted/30'
                          }`}
                        >
                          <Link2
                            className={`h-3 w-3 shrink-0 ${
                              !referenceValidation.valid ? 'text-destructive' : 'text-primary'
                            }`}
                          />
                          <div className="text-xs font-mono flex-1 truncate">
                            {projectId ? (
                              <Link
                                href={`/app/projects/${projectId}/configs/${encodeURIComponent(condition.value.configName)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`hover:underline font-medium ${
                                  !referenceValidation.valid ? 'text-destructive' : 'text-primary'
                                }`}
                              >
                                {condition.value.configName}
                              </Link>
                            ) : (
                              <span
                                className={`font-medium ${
                                  !referenceValidation.valid ? 'text-destructive' : 'text-primary'
                                }`}
                              >
                                {condition.value.configName}
                              </span>
                            )}
                            {condition.value.path.length > 0 && (
                              <span className="text-foreground/80">
                                .{formatJsonPath(condition.value.path)}
                              </span>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={e => {
                              e.preventDefault();
                              if (condition.value.type === 'reference') {
                                handlePreview(
                                  condition.value.configName,
                                  formatJsonPath(condition.value.path),
                                );
                                setShowPreviewDialog(true);
                              }
                            }}
                            className="h-6 w-6 p-0 shrink-0"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {referenceValidation.checking ? (
                          <>Checking reference...</>
                        ) : !referenceValidation.valid ? (
                          <>⚠️ {referenceValidation.error || 'Invalid reference'}</>
                        ) : (
                          <>
                            Reference to {condition.value.configName}
                            {condition.value.path.length > 0 &&
                              ` at ${formatJsonPath(condition.value.path)}`}
                          </>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}

              {/* Percentage range columns - only for segmentation */}
              {condition.operator === 'segmentation' && (
                <>
                  <div className="flex-1">
                    <div className="flex items-center gap-1 mb-1">
                      <Label className="text-xs font-medium">From %</Label>
                      <Help>
                        <p className="text-xs">
                          Starting bucket (0-100). Users are hashed into buckets 0-100.
                        </p>
                      </Help>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      className="h-9 text-xs font-mono w-full"
                      value={'fromPercentage' in condition ? condition.fromPercentage : 0}
                      onChange={e => {
                        const fromPercentage = Math.min(
                          100,
                          Math.max(0, Number(e.target.value) || 0),
                        );
                        onChange({...condition, fromPercentage});
                      }}
                      disabled={readOnly}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1 mb-1">
                      <Label className="text-xs font-medium">To %</Label>
                      <Help>
                        <p className="text-xs">
                          Ending bucket (0-100). Inclusive range: users in buckets [from, to) match.
                        </p>
                      </Help>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      className="h-9 text-xs font-mono w-full"
                      value={'toPercentage' in condition ? condition.toPercentage : 50}
                      onChange={e => {
                        const toPercentage = Math.min(
                          100,
                          Math.max(0, Number(e.target.value) || 0),
                        );
                        onChange({...condition, toPercentage});
                      }}
                      disabled={readOnly}
                      placeholder="50"
                    />
                  </div>
                </>
              )}

              {/* Link/Unlink Reference Button */}
              {!readOnly && 'value' in condition && condition.value.type === 'literal' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTempConfigName('');
                        setTempPath('');
                        setShowReferenceModal(true);
                      }}
                      className="h-9 w-9 p-0 hover:bg-accent"
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Create reference to another config</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {!readOnly && 'value' in condition && condition.value.type === 'reference' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const defaultValue =
                          condition.operator === 'in' || condition.operator === 'not_in' ? [] : '';
                        onChange({
                          ...condition,
                          value: {type: 'literal', value: defaultValue},
                        });
                      }}
                      className="h-9 w-9 p-0 hover:bg-accent"
                    >
                      <Link2Off className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Remove reference</p>
                  </TooltipContent>
                </Tooltip>
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

            {/* Seed field for segmentation - shown below main row */}
            {condition.operator === 'segmentation' && 'seed' in condition && (
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label className="text-xs font-medium">Seed</Label>
                  <Help>
                    <p className="text-xs">
                      Seed string for consistent hashing. Same seed ensures users always get the
                      same bucket. Change seed to reshuffle users into different buckets.
                    </p>
                  </Help>
                </div>
                <div className="flex gap-2">
                  <Input
                    className="h-9 text-xs font-mono flex-1"
                    value={condition.seed}
                    onChange={e => {
                      onChange({...condition, seed: e.target.value});
                    }}
                    disabled={readOnly}
                    placeholder="experiment-1"
                  />
                  {!readOnly && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onChange({...condition, seed: generateSeed()});
                          }}
                          className="h-9 px-3"
                        >
                          Regenerate
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">Generate a new random seed</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            )}

            {/* Multi-value input for in/not_in - shown below for literal values */}
            {(condition.operator === 'in' || condition.operator === 'not_in') &&
              'value' in condition &&
              condition.value.type === 'literal' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Values</Label>
                    <Badge variant="secondary" className="text-xs">
                      {(() => {
                        const values = Array.isArray(condition.value.value)
                          ? condition.value.value
                          : [];
                        return `${values.length} ${values.length === 1 ? 'value' : 'values'}`;
                      })()}
                    </Badge>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-2">
                    <ScrollArea className="h-40">
                      <div className="space-y-1.5 pr-3">
                        {(() => {
                          const values = Array.isArray(condition.value.value)
                            ? condition.value.value
                            : [];

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
                                className="h-8 text-xs font-mono flex-1 bg-background"
                                value={typeof val === 'string' ? val : JSON.stringify(val)}
                                onChange={e => {
                                  const newValues = [...values];
                                  newValues[idx] = e.target.value;
                                  onChange({
                                    ...condition,
                                    value: {type: 'literal', value: newValues},
                                  });
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
                                          value: {
                                            type: 'literal',
                                            value: newValues.length > 0 ? newValues : [],
                                          },
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
                          if ('value' in condition && condition.value.type === 'literal') {
                            const values = Array.isArray(condition.value.value)
                              ? condition.value.value
                              : [];
                            const newValues = [...values, ''];
                            onChange({
                              ...condition,
                              value: {type: 'literal', value: newValues},
                            });
                          }
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
                  <Help>
                    <p className="text-xs">
                      {operatorDescriptions[condition.operator] || 'Select an operator'}
                    </p>
                  </Help>
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
                        value: {type: 'literal', value: ''},
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
                    projectId={projectId}
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
                        projectId={projectId}
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

      {/* Reference Creation Modal */}
      <Dialog open={showReferenceModal} onOpenChange={setShowReferenceModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Config Reference</DialogTitle>
            <DialogDescription>
              Reference a value from another config in this project. The value will be resolved at
              evaluation time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ref-config-name">Config Name</Label>
              <Input
                id="ref-config-name"
                value={tempConfigName}
                onChange={e => setTempConfigName(e.target.value)}
                placeholder="e.g., pricing-tiers"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ref-path">JSON Path (optional)</Label>
              <Input
                id="ref-path"
                value={tempPath}
                onChange={e => setTempPath(e.target.value)}
                placeholder="e.g., tier.premium or [0].value"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to reference the entire config value
              </p>
            </div>

            {/* Preview Section */}
            <div className="space-y-2">
              <Label>Preview</Label>
              {previewValue.loading && (
                <div className="rounded-md border bg-muted p-3 flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">Loading...</p>
                </div>
              )}
              {previewValue.error && !previewValue.loading && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
                  <p className="text-xs text-destructive">{previewValue.error}</p>
                </div>
              )}
              {previewValue.value !== undefined && !previewValue.error && !previewValue.loading && (
                <div className="max-h-32 overflow-auto">
                  <CodeSnippet
                    code={JSON.stringify(previewValue.value, null, 2)}
                    language="json"
                  />
                </div>
              )}
              {!previewValue.loading &&
                !previewValue.error &&
                previewValue.value === undefined &&
                tempConfigName.trim() && (
                  <div className="rounded-md border border-dashed bg-muted/30 p-3 flex items-center justify-center">
                    <p className="text-xs text-muted-foreground">
                      Enter a config name to see preview
                    </p>
                  </div>
                )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowReferenceModal(false);
                setTempConfigName('');
                setTempPath('');
                setPreviewValue({loading: false});
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!tempConfigName.trim()}
              onClick={() => {
                if (!tempConfigName.trim()) {
                  alert('Config name is required');
                  return;
                }
                if ('value' in condition) {
                  onChange({
                    ...condition,
                    value: {
                      type: 'reference',
                      projectId: projectId || '',
                      configName: tempConfigName.trim(),
                      path: tempPath.trim() ? parseJsonPath(tempPath.trim()) : [],
                    },
                  });
                }
                setShowReferenceModal(false);
                setTempConfigName('');
                setTempPath('');
                setPreviewValue({loading: false});
              }}
            >
              Create Reference
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Value Dialog */}
      <ReferenceValuePreviewDialog
        open={showPreviewDialog}
        onOpenChange={setShowPreviewDialog}
        configName={
          'value' in condition && condition.value.type === 'reference'
            ? condition.value.configName
            : undefined
        }
        path={
          'value' in condition &&
          condition.value.type === 'reference' &&
          condition.value.path.length > 0
            ? formatJsonPath(condition.value.path)
            : undefined
        }
        previewState={previewValue}
        projectId={projectId}
      />
    </div>
  );
}
