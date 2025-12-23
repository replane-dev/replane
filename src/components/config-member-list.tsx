'use client';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Plus, Trash2} from 'lucide-react';

export interface EditorListProps {
  editors: string[];
  onChange: (editors: string[]) => void;
  disabled?: boolean;
  errors?: Array<{message?: string} | undefined>;
}

export function EditorList({editors, onChange, disabled = false, errors = []}: EditorListProps) {
  const handleEmailChange = (idx: number, email: string) => {
    const updated = [...editors];
    updated[idx] = email;
    onChange(updated);
  };

  const handleRemove = (idx: number) => {
    const updated = editors.filter((_, i) => i !== idx);
    onChange(updated);
  };

  const handleAdd = () => {
    const updated = [...editors, ''];
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {editors.length > 0 && (
        <div className="space-y-3">
          {editors.map((email, idx) => {
            const fieldError = errors[idx];
            const hasEmailError = !!fieldError?.message;

            return (
              <div key={idx} className="space-y-2">
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors ${
                    hasEmailError ? 'border-destructive' : ''
                  }`}
                >
                  <Input
                    placeholder="Email address"
                    value={email}
                    onChange={e => handleEmailChange(idx, e.target.value)}
                    className={`flex-1 ${hasEmailError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    readOnly={disabled}
                    aria-readonly={disabled}
                    aria-invalid={hasEmailError}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(idx)}
                    title="Remove editor"
                    disabled={disabled}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {hasEmailError && (
                  <p className="text-sm text-destructive px-3">{fieldError?.message}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div>
        <Button type="button" variant="secondary" onClick={handleAdd} disabled={disabled}>
          <Plus className="mr-1 h-4 w-4" /> Add editor
        </Button>
      </div>
    </div>
  );
}
