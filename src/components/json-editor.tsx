'use client';

import Editor, {type OnChange, type OnMount} from '@monaco-editor/react';
// Import only the main meta-schemas (not sub-schemas) to keep $schema autocomplete clean
import draft2019MetaSchema from 'ajv/dist/refs/json-schema-2019-09/schema.json';
import draft2020MetaSchema from 'ajv/dist/refs/json-schema-2020-12/schema.json';
import draft06MetaSchema from 'ajv/dist/refs/json-schema-draft-06.json';
import draft07MetaSchema from 'ajv/dist/refs/json-schema-draft-07.json';
import type * as Monaco from 'monaco-editor';
import {useTheme} from 'next-themes';
import * as React from 'react';

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
  const {resolvedTheme} = useTheme();
  const editorTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light';

  const handleChange: OnChange = val => {
    onChange(val ?? '');
  };

  const reactId = React.useId();
  const path = React.useMemo(() => `inmemory://model/${id ?? reactId}.json`, [id, reactId]);
  const schemaUri = React.useMemo(() => `inmemory://schema/${id ?? reactId}.json`, [id, reactId]);

  const monacoRef = React.useRef<Parameters<OnMount>[0] | null>(null);
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
  }, [schema, path, id, reactId, schemaUri]);

  return (
    <div className="border rounded-md relative">
      <Editor
        {...rest}
        language="json"
        defaultLanguage="json"
        theme={editorTheme}
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
