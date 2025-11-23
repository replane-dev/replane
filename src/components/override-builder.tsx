'use client';

import {Button} from '@/components/ui/button';
import type {Condition} from '@/engine/core/override-evaluator';
import {Plus} from 'lucide-react';
import {useState} from 'react';
import {OverrideCard} from './override-card';

export type {Condition};

export interface Override {
  name: string;
  conditions: Condition[]; // All conditions must match (implicit AND)
  value: any;
}

interface OverrideBuilderProps {
  overrides: Override[] | null;
  onChange: (overrides: Override[] | null) => void;
  readOnly?: boolean;
  schema?: any;
  defaultValue?: any; // Current config value to use as default for new overrides
}

export function OverrideBuilder({
  overrides,
  onChange,
  readOnly,
  schema,
  defaultValue,
}: OverrideBuilderProps) {
  const [localOverrides, setLocalOverrides] = useState<Override[]>(overrides || []);
  const [expandedOverrides, setExpandedOverrides] = useState<Set<number>>(
    () => new Set(Array.from({length: (overrides || []).length}, (_, i) => i)),
  );
  const [overrideViewModes, setOverrideViewModes] = useState<Map<number, 'form' | 'json'>>(
    new Map(),
  );

  const handleAddOverride = () => {
    const newOverride: Override = {
      name: `Override ${localOverrides.length + 1}`,
      conditions: [
        {
          operator: 'equals',
          property: '',
          value: '',
        },
      ],
      value: defaultValue !== undefined ? defaultValue : null,
    };
    const updated = [...localOverrides, newOverride];
    setLocalOverrides(updated);
    onChange(updated);
  };

  const handleRemoveOverride = (overrideIndex: number) => {
    const updated = localOverrides.filter((_, i) => i !== overrideIndex);
    setLocalOverrides(updated);
    onChange(updated);
  };

  const handleUpdateOverride = (overrideIndex: number, field: keyof Override, value: any) => {
    const updated = localOverrides.map((o, i) => {
      if (overrideIndex === i) {
        return {...o, [field]: value};
      }
      return o;
    });
    setLocalOverrides(updated);
    onChange(updated);
  };

  const handleAddCondition = (overrideIndex: number) => {
    const updated = localOverrides.map((o, i) => {
      if (overrideIndex === i) {
        const newCondition: Condition = {
          operator: 'equals',
          property: '',
          value: '',
        };
        return {...o, conditions: [...o.conditions, newCondition]};
      }
      return o;
    });
    setLocalOverrides(updated);
    onChange(updated);
  };

  const handleUpdateCondition = (
    overrideIndex: number,
    conditionIndex: number,
    condition: Condition,
  ) => {
    const updated = localOverrides.map((o, i) => {
      if (overrideIndex === i) {
        const newConditions = [...o.conditions];
        newConditions[conditionIndex] = condition;
        return {...o, conditions: newConditions};
      }
      return o;
    });
    setLocalOverrides(updated);
    onChange(updated);
  };

  const handleRemoveCondition = (overrideIndex: number, conditionIndex: number) => {
    const updated = localOverrides.map((o, i) => {
      if (overrideIndex === i) {
        return {...o, conditions: o.conditions.filter((_, i) => i !== conditionIndex)};
      }
      return o;
    });
    setLocalOverrides(updated);
    onChange(updated);
  };

  const toggleOverride = (index: number) => {
    setExpandedOverrides(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const getOverrideViewMode = (index: number) => overrideViewModes.get(index) || 'form';

  const setOverrideViewMode = (index: number, mode: 'form' | 'json') => {
    setOverrideViewModes(prev => new Map(prev).set(index, mode));
  };

  return (
    <div className="space-y-4">
      {localOverrides.length > 0 && (
        <div className="space-y-4">
          {localOverrides.map((override, overrideIndex) => (
            <OverrideCard
              key={overrideIndex}
              override={override}
              index={overrideIndex}
              isExpanded={expandedOverrides.has(overrideIndex)}
              viewMode={getOverrideViewMode(overrideIndex)}
              readOnly={readOnly}
              schema={schema}
              onToggleExpand={() => toggleOverride(overrideIndex)}
              onViewModeChange={mode => setOverrideViewMode(overrideIndex, mode)}
              onUpdate={(field, value) => handleUpdateOverride(overrideIndex, field, value)}
              onRemove={() => handleRemoveOverride(overrideIndex)}
              onAddCondition={() => handleAddCondition(overrideIndex)}
              onUpdateCondition={(conditionIndex, condition) =>
                handleUpdateCondition(overrideIndex, conditionIndex, condition)
              }
              onRemoveCondition={conditionIndex =>
                handleRemoveCondition(overrideIndex, conditionIndex)
              }
            />
          ))}
        </div>
      )}

      {!readOnly && (
        <Button
          type="button"
          variant="outline"
          size="default"
          onClick={handleAddOverride}
          className="w-full h-10 border-dashed border-1"
        >
          <Plus className="h-4 w-4 mr-2" />
          {localOverrides.length === 0 ? 'Add Value Override Rule' : 'Add Another Value Override'}
        </Button>
      )}
    </div>
  );
}
