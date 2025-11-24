'use client';

import {Button} from '@/components/ui/button';
import type {Override} from '@/engine/core/override-evaluator';
import {Plus} from 'lucide-react';
import {OverrideCard} from './override-card';

interface OverrideBuilderProps {
  overrides: Override[];
  onChange: (overrides: Override[]) => void;
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
  const handleAddOverride = () => {
    const newOverride: Override = {
      name: `Override ${overrides.length + 1}`,
      conditions: [
        {
          operator: 'equals',
          property: '',
          value: {type: 'literal', value: ''},
        },
      ],
      value: defaultValue !== undefined ? defaultValue : null,
    };
    onChange([...overrides, newOverride]);
  };

  const handleRemoveOverride = (overrideIndex: number) => {
    onChange(overrides.filter((_, i) => i !== overrideIndex));
  };

  const handleUpdateOverride = (overrideIndex: number, updatedOverride: Override) => {
    onChange(overrides.map((o, i) => (i === overrideIndex ? updatedOverride : o)));
  };

  return (
    <div className="space-y-4">
      {overrides.length > 0 && (
        <div className="space-y-4">
          {overrides.map((override, overrideIndex) => (
            <OverrideCard
              key={overrideIndex}
              override={override}
              index={overrideIndex}
              readOnly={readOnly}
              schema={schema}
              projectId={projectId}
              onUpdate={updatedOverride => handleUpdateOverride(overrideIndex, updatedOverride)}
              onRemove={() => handleRemoveOverride(overrideIndex)}
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
          {overrides.length === 0 ? 'Add Value Override Rule' : 'Add Another Value Override'}
        </Button>
      )}
    </div>
  );
}
