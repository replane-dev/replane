'use client';

import {Button} from '@/components/ui/button';
import type {Condition} from '@/engine/core/override-condition-schemas';
import type {Override} from '@/engine/core/override-evaluator';
import {Plus} from 'lucide-react';
import {useState} from 'react';
import {OverrideCard} from './override-card';

interface OverrideBuilderProps {
  overrides: Override[] | null;
  onChange: (overrides: Override[] | null) => void;
  readOnly?: boolean;
  schema?: any;
  defaultValue?: any; // Current config value to use as default for new overrides
  projectId?: string;
}

export function OverrideBuilder({
  overrides,
  onChange,
  readOnly,
  schema,
  defaultValue,
  projectId,
}: OverrideBuilderProps) {
  const [localOverrides, setLocalOverrides] = useState<Override[]>(overrides || []);

  const handleAddOverride = () => {
    const newOverride: Override = {
      name: `Override ${localOverrides.length + 1}`,
      conditions: [
        {
          operator: 'equals',
          property: '',
          value: {type: 'literal', value: ''},
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
          value: {type: 'literal', value: ''},
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

  return (
    <div className="space-y-4">
      {localOverrides.length > 0 && (
        <div className="space-y-4">
          {localOverrides.map((override, overrideIndex) => (
            <OverrideCard
              key={overrideIndex}
              override={override}
              index={overrideIndex}
              readOnly={readOnly}
              schema={schema}
              projectId={projectId}
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
