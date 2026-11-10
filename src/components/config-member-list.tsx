'use client';

import {JsonEditor} from '@/components/json-editor';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {editorsToJson, parseEditorsJson} from '@/lib/editor-emails-json';
import {Plus, Trash2} from 'lucide-react';
import * as React from 'react';

const EDITORS_JSON_SCHEMA = {
  type: 'array',
  items: {type: 'string', format: 'email'},
  uniqueItems: true,
};

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

export interface EditorJsonEditorProps extends EditorListProps {
  editorName: string;
  id?: string;
}

export function EditorJsonEditor({
  editors,
  onChange,
  disabled = false,
  errors = [],
  editorName,
  id,
}: EditorJsonEditorProps) {
  // Local text keeps partially typed JSON on screen; the form only receives parseable arrays.
  const [jsonText, setJsonText] = React.useState(() => editorsToJson(editors));
  const [isInvalid, setIsInvalid] = React.useState(false);

  const handleJsonChange = (text: string) => {
    setJsonText(text);
    const parsed = parseEditorsJson(text);
    setIsInvalid(parsed === null);
    if (parsed !== null) {
      onChange(parsed);
    }
  };

  const emailErrors = errors.flatMap((error, idx) =>
    error?.message ? [{email: editors[idx], message: error.message}] : [],
  );

  return (
    <div className="space-y-2">
      <JsonEditor
        id={id}
        editorName={editorName}
        height={200}
        value={jsonText}
        onChange={handleJsonChange}
        schema={EDITORS_JSON_SCHEMA}
        readOnly={disabled}
        error={isInvalid}
        aria-label="Editors JSON"
      />
      {isInvalid && (
        <p className="text-sm text-destructive">
          Enter a JSON array of email strings, e.g. [&quot;name@example.com&quot;].
        </p>
      )}
      {emailErrors.map(({email, message}, idx) => (
        <p key={idx} className="text-sm text-destructive">
          <span className="font-mono">{email}</span>: {message}
        </p>
      ))}
    </div>
  );
}
