'use client';

import Editor, {type OnMount} from '@monaco-editor/react';
// Import only the main meta-schemas (not sub-schemas) to keep $schema autocomplete clean
import draft2019MetaSchema from 'ajv/dist/refs/json-schema-2019-09/schema.json';
import draft2020MetaSchema from 'ajv/dist/refs/json-schema-2020-12/schema.json';
import draft06MetaSchema from 'ajv/dist/refs/json-schema-draft-06.json';
import draft07MetaSchema from 'ajv/dist/refs/json-schema-draft-07.json';
import type * as Monaco from 'monaco-editor';
import {useTheme} from 'next-themes';
import * as React from 'react';

import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog';

// Draft-04 meta-schema (not available in ajv package, defined inline)
// Source: http://json-schema.org/draft-04/schema#
const draft04MetaSchema = {
  id: 'http://json-schema.org/draft-04/schema#',
  $schema: 'http://json-schema.org/draft-04/schema#',
  description: 'Core schema meta-schema',
  definitions: {
    schemaArray: {
      type: 'array',
      minItems: 1,
      items: {$ref: '#'},
    },
    positiveInteger: {
      type: 'integer',
      minimum: 0,
    },
    positiveIntegerDefault0: {
      allOf: [{$ref: '#/definitions/positiveInteger'}, {default: 0}],
    },
    simpleTypes: {
      enum: ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string'],
    },
    stringArray: {
      type: 'array',
      items: {type: 'string'},
      minItems: 1,
      uniqueItems: true,
    },
  },
  type: 'object',
  properties: {
    id: {
      type: 'string',
    },
    $schema: {
      type: 'string',
    },
    title: {
      type: 'string',
    },
    description: {
      type: 'string',
    },
    default: {},
    multipleOf: {
      type: 'number',
      minimum: 0,
      exclusiveMinimum: true,
    },
    maximum: {
      type: 'number',
    },
    exclusiveMaximum: {
      type: 'boolean',
      default: false,
    },
    minimum: {
      type: 'number',
    },
    exclusiveMinimum: {
      type: 'boolean',
      default: false,
    },
    maxLength: {$ref: '#/definitions/positiveInteger'},
    minLength: {$ref: '#/definitions/positiveIntegerDefault0'},
    pattern: {
      type: 'string',
      format: 'regex',
    },
    additionalItems: {
      anyOf: [{type: 'boolean'}, {$ref: '#'}],
      default: {},
    },
    items: {
      anyOf: [{$ref: '#'}, {$ref: '#/definitions/schemaArray'}],
      default: {},
    },
    maxItems: {$ref: '#/definitions/positiveInteger'},
    minItems: {$ref: '#/definitions/positiveIntegerDefault0'},
    uniqueItems: {
      type: 'boolean',
      default: false,
    },
    maxProperties: {$ref: '#/definitions/positiveInteger'},
    minProperties: {$ref: '#/definitions/positiveIntegerDefault0'},
    required: {$ref: '#/definitions/stringArray'},
    additionalProperties: {
      anyOf: [{type: 'boolean'}, {$ref: '#'}],
      default: {},
    },
    definitions: {
      type: 'object',
      additionalProperties: {$ref: '#'},
      default: {},
    },
    properties: {
      type: 'object',
      additionalProperties: {$ref: '#'},
      default: {},
    },
    patternProperties: {
      type: 'object',
      additionalProperties: {$ref: '#'},
      default: {},
    },
    dependencies: {
      type: 'object',
      additionalProperties: {
        anyOf: [{$ref: '#'}, {$ref: '#/definitions/stringArray'}],
      },
    },
    enum: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
    },
    type: {
      anyOf: [
        {$ref: '#/definitions/simpleTypes'},
        {
          type: 'array',
          items: {$ref: '#/definitions/simpleTypes'},
          minItems: 1,
          uniqueItems: true,
        },
      ],
    },
    format: {type: 'string'},
    allOf: {$ref: '#/definitions/schemaArray'},
    anyOf: {$ref: '#/definitions/schemaArray'},
    oneOf: {$ref: '#/definitions/schemaArray'},
    not: {$ref: '#'},
  },
  dependencies: {
    exclusiveMaximum: ['maximum'],
    exclusiveMinimum: ['minimum'],
  },
  default: {},
};

// Global registry of active JSON schemas keyed by model path.
// This avoids editors overwriting each other's schema diagnostics.
const jsonSchemaRegistry = new Map<string, {uri: string; schema: unknown}>();

// Predefined JSON Schema meta-schemas to avoid remote requests
// These are the official meta-schemas that define the JSON Schema specification itself
// By predefining only the top-level schemas, we keep $schema autocomplete clean
// while still providing validation for all major schema versions

// Only register the top-level schemas - these are what users should reference in $schema
// Note: 2019-09 and 2020-12 are modular specs with sub-schemas, but we don't register
// the sub-schemas to avoid cluttering autocomplete. Monaco may show warnings about
// missing sub-schemas, but the main schemas are sufficient for most validation needs.
const PREDEFINED_SCHEMAS = [
  // Draft-04 (single file)
  {
    uri: 'http://json-schema.org/draft-04/schema#',
    schema: draft04MetaSchema,
  },
  // Draft-06 (single file)
  {
    uri: 'http://json-schema.org/draft-06/schema#',
    schema: draft06MetaSchema,
  },
  // Draft-07 (single file)
  {
    uri: 'http://json-schema.org/draft-07/schema#',
    schema: draft07MetaSchema,
  },
  // Draft 2019-09 (main schema only)
  {
    uri: 'https://json-schema.org/draft/2019-09/schema',
    schema: draft2019MetaSchema,
  },
  // Draft 2020-12 (main schema only)
  {
    uri: 'https://json-schema.org/draft/2020-12/schema',
    schema: draft2020MetaSchema,
  },
];

/**
 * Refreshes Monaco's JSON diagnostics with all registered schemas.
 * Supports all JSON Schema versions (draft-04, draft-06, draft-07, 2019-09, 2020-12).
 * Monaco auto-detects the schema version from the $schema field in each schema.
 *
 * Note: We only register the 5 main meta-schemas to keep $schema autocomplete clean.
 * Sub-schemas for 2019-09 and 2020-12 are available but not registered to avoid clutter.
 * Monaco will request missing sub-schemas, but validation will still work without requiring remote requests.
 */
function refreshJsonDiagnostics(monaco: typeof Monaco) {
  const userSchemas = Array.from(jsonSchemaRegistry.entries()).map(([path, entry]) => ({
    uri: entry.uri,
    fileMatch: [path],
    schema: entry.schema,
  }));

  // Only register main schemas to keep $schema autocomplete clean
  // This means sub-schemas won't show up when typing "$schema": "..."
  const allSchemas = [...PREDEFINED_SCHEMAS, ...userSchemas];

  // Configure Monaco's JSON language service
  // By predefining all meta-schemas, we avoid remote requests for security and performance
  monaco.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    enableSchemaRequest: true,
    schemaValidation: 'error',
    schemas: allSchemas,
  });
}

export type JsonEditorProps = {
  value: string;
  onChange: (value: string) => void;
  height?: string | number;
  placeholder?: string;
  readOnly?: boolean;
  'aria-label'?: string;
  /**
   * When true, displays a red border to indicate validation error.
   */
  error?: boolean;
  /**
   * Optional JSON Schema for validation and intellisense.
   * Supports all JSON Schema versions:
   * - draft-04: http://json-schema.org/draft-04/schema#
   * - draft-06: http://json-schema.org/draft-06/schema#
   * - draft-07: http://json-schema.org/draft-07/schema#
   * - 2019-09: https://json-schema.org/draft/2019-09/schema
   * - 2020-12: https://json-schema.org/draft/2020-12/schema
   *
   * The schema version is auto-detected from the $schema field in the schema object.
   */
  schema?: unknown | undefined;
  id?: string; // to make model path stable for schema matching
  /**
   * Optional callback to open full-screen editor.
   * When provided, an expand button will be shown in the editor.
   */
  onFullScreen?: () => void;
  /**
   * Name/label for the editor. Used as the title in full-screen mode.
   * Required for better UX in full-screen dialog.
   */
  editorName: string;
  /**
   * If true, emit onChange on every keystroke instead of only on blur.
   * Default is false (emit on blur only).
   */
  emitOnChange?: boolean;
};

export type JsonEditorRef = {
  setValue: (value: string) => void;
  getValue: () => string;
};

const JsonEditorImpl = React.forwardRef<JsonEditorRef, JsonEditorProps>(
  (
    {
      value,
      onChange,
      height = 300,
      placeholder,
      readOnly,
      schema,
      id,
      onFullScreen,
      emitOnChange,
      error,
      ...rest
    },
    ref,
  ) => {
    const {resolvedTheme} = useTheme();
    const editorTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light';

    const reactId = React.useId();
    const path = React.useMemo(() => `inmemory://model/${id ?? reactId}.json`, [id, reactId]);
    const schemaUri = React.useMemo(() => `inmemory://schema/${id ?? reactId}.json`, [id, reactId]);

    const monacoRef = React.useRef<Parameters<OnMount>[0] | null>(null);
    const monacoNsRef = React.useRef<typeof Monaco | null>(null);
    const registeredRef = React.useRef(false);
    const currentValueRef = React.useRef(value);

    // Expose imperative methods via ref
    React.useImperativeHandle(
      ref,
      () => ({
        setValue: (newValue: string) => {
          const editor = monacoRef.current;
          if (editor) {
            const model = editor.getModel();
            if (model) {
              model.setValue(newValue);
              currentValueRef.current = newValue;
              // Emit change immediately when set via ref
              onChange(newValue);
            }
          }
        },
        getValue: () => {
          const editor = monacoRef.current;
          if (editor) {
            return editor.getValue();
          }
          return value;
        },
      }),
      // Empty deps array is intentional - we want stable ref methods that access the latest monacoRef
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [onChange],
    );

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

      if (emitOnChange) {
        // Emit changes on every change
        editor.onDidChangeModelContent(() => {
          const currentValue = editor.getValue();
          if (currentValue !== currentValueRef.current) {
            currentValueRef.current = currentValue;
            onChange(currentValue);
          }
        });
      } else {
        // Emit changes only on blur
        editor.onDidBlurEditorText(() => {
          const currentValue = editor.getValue();
          if (currentValue !== currentValueRef.current) {
            currentValueRef.current = currentValue;
            onChange(currentValue);
          }
        });
      }
    };

    // Sync currentValueRef when value prop changes
    React.useEffect(() => {
      currentValueRef.current = value;
    }, [value]);

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
    }, [schema, path, id, reactId, schemaUri]);

    return (
      <div
        className={`border rounded-md overflow-hidden relative h-full ${error ? 'border-destructive' : ''}`}
      >
        <Editor
          {...rest}
          language="json"
          defaultLanguage="json"
          theme={editorTheme}
          path={path}
          value={value}
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
        {onFullScreen && !readOnly && (
          <button
            onClick={onFullScreen}
            className="absolute top-2 right-6 p-1.5 rounded-md bg-background/70 hover:bg-background border hover:border-foreground/20 transition-colors"
            title="Expand to full screen"
            type="button"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
        )}
      </div>
    );
  },
);

JsonEditorImpl.displayName = 'JsonEditorImpl';

export function JsonEditor(props: JsonEditorProps) {
  const [isFullScreen, setIsFullScreen] = React.useState(false);
  const baseId = React.useId();
  const normalEditorRef = React.useRef<JsonEditorRef>(null);
  const fullscreenEditorRef = React.useRef<JsonEditorRef>(null);
  const isClosingRef = React.useRef(false);

  // Generate unique IDs for each editor instance
  const normalId = props.id ?? `${baseId}-normal`;
  const fullscreenId = props.id ? `${props.id}-fullscreen` : `${baseId}-fullscreen`;

  const handleFullScreenOpen = () => {
    isClosingRef.current = false;
    setIsFullScreen(true);
  };

  const handleFullScreenClose = () => {
    // Set flag to prevent blur handler from overwriting the value
    isClosingRef.current = true;

    // Before closing, ensure the full-screen editor's current value is saved
    if (fullscreenEditorRef.current) {
      const currentValue = fullscreenEditorRef.current.getValue();
      // Update normal editor and notify parent directly
      normalEditorRef.current?.setValue(currentValue);
      props.onChange(currentValue);
    }
    setIsFullScreen(false);
  };

  const handleFullScreenChange = (value: string) => {
    // Skip if we're in the process of closing (blur event from unmounting editor)
    if (isClosingRef.current) {
      return;
    }
    // Update normal editor via ref (this also calls props.onChange)
    normalEditorRef.current?.setValue(value);
  };

  return (
    <>
      <JsonEditorImpl
        ref={normalEditorRef}
        value={props.value}
        onChange={props.onChange}
        height={props.height}
        placeholder={props.placeholder}
        readOnly={props.readOnly}
        schema={props.schema}
        aria-label={props['aria-label']}
        id={normalId}
        editorName={props.editorName}
        onFullScreen={handleFullScreenOpen}
        emitOnChange
        error={props.error}
      />
      <Dialog
        open={isFullScreen}
        onOpenChange={open => {
          if (!open) {
            handleFullScreenClose();
          }
        }}
      >
        <DialogContent
          className="sm:max-w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] flex flex-col p-0"
          onEscapeKeyDown={e => {
            e.preventDefault();
            e.stopPropagation();
            handleFullScreenClose();
          }}
        >
          <DialogHeader className="p-4 border-b">
            <DialogTitle>{props.editorName}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 p-4 overflow-hidden">
            <div className="h-full">
              <JsonEditorImpl
                ref={fullscreenEditorRef}
                value={props.value}
                onChange={handleFullScreenChange}
                height="100%"
                placeholder={props.placeholder}
                readOnly={props.readOnly}
                schema={props.schema}
                aria-label={props['aria-label']}
                id={fullscreenId}
                editorName={props.editorName}
                onFullScreen={undefined}
                emitOnChange
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
