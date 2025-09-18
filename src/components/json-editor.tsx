'use client';

import Editor, {type OnChange, type OnMount} from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import * as React from 'react';

// Global registry of active JSON schemas keyed by model path.
// This avoids editors overwriting each other's schema diagnostics.
const jsonSchemaRegistry = new Map<string, {uri: string; schema: unknown}>();

function refreshJsonDiagnostics(monaco: typeof Monaco) {
  const schemas = Array.from(jsonSchemaRegistry.entries()).map(([path, entry]) => ({
    uri: entry.uri,
    fileMatch: [path],
    schema: entry.schema,
  }));
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    enableSchemaRequest: false,
    schemaValidation: 'error',
    schemas,
  });
}

export type JsonEditorProps = {
  value: string;
  onChange: (value: string) => void;
  height?: string | number;
  placeholder?: string;
  readOnly?: boolean;
  'aria-label'?: string;
  schema?: unknown | undefined;
  id?: string; // to make model path stable for schema matching
};

export function JsonEditor({
  value,
  onChange,
  height = 300,
  placeholder,
  readOnly,
  schema,
  id,
  ...rest
}: JsonEditorProps) {
  const handleChange: OnChange = val => {
    onChange(val ?? '');
  };

  const reactId = React.useId();
  const path = React.useMemo(() => `inmemory://model/${id ?? reactId}.json`, [id, reactId]);
  const schemaUri = React.useMemo(() => `inmemory://schema/${id ?? reactId}.json`, [id, reactId]);

  const monacoRef = React.useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoNsRef = React.useRef<typeof Monaco | null>(null);
  const registeredRef = React.useRef(false);

  const handleMount: OnMount = (editor, monaco) => {
    monacoRef.current = editor;
    monacoNsRef.current = monaco as unknown as typeof Monaco;
    // Ensure the model has our path so fileMatch works
    const model = editor.getModel();
    if (!model || model.uri.toString() !== path) {
      const newModel = monaco.editor.createModel(value ?? '', 'json', monaco.Uri.parse(path));
      editor.setModel(newModel);
    }
    // Register schema on mount if provided
    if (schema) {
      jsonSchemaRegistry.set(path, {uri: schemaUri, schema});
      refreshJsonDiagnostics(monaco as unknown as typeof Monaco);
      registeredRef.current = true;
    } else {
      // Ensure diagnostics at least enabled
      refreshJsonDiagnostics(monaco as unknown as typeof Monaco);
    }
  };

  React.useEffect(() => {
    const monaco = monacoNsRef.current;
    if (!monaco) return;
    if (schema) {
      jsonSchemaRegistry.set(path, {uri: schemaUri, schema});
      registeredRef.current = true;
    } else if (registeredRef.current) {
      jsonSchemaRegistry.delete(path);
      registeredRef.current = false;
    }
    refreshJsonDiagnostics(monaco);

    return () => {
      // Cleanup when component unmounts or ids change
      if (jsonSchemaRegistry.has(path)) {
        jsonSchemaRegistry.delete(path);
        refreshJsonDiagnostics(monaco);
      }
    };
  }, [schema, path, id, reactId]);

  return (
    <div className="border rounded-md relative">
      <Editor
        {...rest}
        language="json"
        defaultLanguage="json"
        path={path}
        value={value}
        onChange={handleChange}
        onMount={handleMount}
        height={height}
        options={{
          readOnly: !!readOnly,
          minimap: {enabled: false},
          scrollBeyondLastLine: false,
          scrollbar: {alwaysConsumeMouseWheel: false},
          wordWrap: 'on',
          tabSize: 2,
          insertSpaces: true,
          automaticLayout: true,
          formatOnPaste: true,
          formatOnType: true,
          fixedOverflowWidgets: true,
        }}
      />
      {placeholder && !value && (
        <div className="pointer-events-none absolute left-0 top-0 p-3 text-muted-foreground/60 text-sm">
          {placeholder}
        </div>
      )}
    </div>
  );
}
