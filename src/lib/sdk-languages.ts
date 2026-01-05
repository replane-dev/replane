/**
 * SDK language configurations for the integration guide and codegen.
 */

export type SdkLanguage = 'javascript' | 'python' | 'csharp';

export type CodeSnippetLanguage =
  | 'typescript'
  | 'javascript'
  | 'shell'
  | 'json'
  | 'python'
  | 'csharp';

export interface SdkLanguageConfig {
  id: SdkLanguage;
  name: string;
  displayName: string;
  codegenLanguage: 'typescript' | 'python' | 'csharp';
  typesFileExtension: string;
  codeLanguage: CodeSnippetLanguage;
  installSnippet: string;
  packageName: string;
  docsUrl: string;
}

export const SDK_LANGUAGES: Record<SdkLanguage, SdkLanguageConfig> = {
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    displayName: 'JavaScript / TypeScript',
    codegenLanguage: 'typescript',
    typesFileExtension: '.ts',
    codeLanguage: 'typescript',
    installSnippet: 'npm install @replanejs/sdk',
    packageName: '@replanejs/sdk',
    docsUrl: 'https://replane.dev/docs/sdks/javascript',
  },
  python: {
    id: 'python',
    name: 'Python',
    displayName: 'Python',
    codegenLanguage: 'python',
    typesFileExtension: '.py',
    codeLanguage: 'python',
    installSnippet: 'pip install replane',
    packageName: 'replane',
    docsUrl: 'https://replane.dev/docs/sdks/python',
  },
  csharp: {
    id: 'csharp',
    name: 'C#',
    displayName: 'C# / .NET',
    codegenLanguage: 'csharp',
    typesFileExtension: '.cs',
    codeLanguage: 'csharp',
    installSnippet: 'dotnet add package Replane',
    packageName: 'Replane',
    docsUrl: 'https://replane.dev/docs/sdks/dotnet',
  },
};

export const SDK_LANGUAGE_LIST: SdkLanguage[] = ['javascript', 'python', 'csharp'];

/**
 * Generates the basic usage code snippet (without codegen types).
 */
export function generateUsageSnippet(params: {
  language: SdkLanguage;
  sdkKey: string;
  baseUrl: string;
  exampleConfigName: string;
}): string {
  const {language, sdkKey, baseUrl, exampleConfigName} = params;

  switch (language) {
    case 'javascript':
      return `import { Replane } from '@replanejs/sdk';

// Create client
const replane = new Replane();

// Connect to the server (fetches project's configs during initialization)
await replane.connect({
    sdkKey: '${sdkKey}',
    baseUrl: '${baseUrl}',
});

// Get config value
const config = replane.get('${exampleConfigName}');

// Configs are automatically updated in realtime via SSE
// No need to refetch or reload - just call get() again

// Clean up when your application shuts down
replane.disconnect();`;

    case 'python':
      return `from replane import Replane

# Using context manager (recommended)
with Replane(
    base_url="${baseUrl}",
    sdk_key="${sdkKey}",
) as client:
    # Get config value
    config = client.configs["${exampleConfigName}"]

    # Safe access with default fallback
    # config = client.configs.get("${exampleConfigName}", default_value)

    # Configs are automatically updated in realtime via SSE
    # No need to refetch - just access .configs again

# Alternative: async client
# from replane import AsyncReplane
# async with AsyncReplane(...) as client:
#     config = client.configs["${exampleConfigName}"]`;

    case 'csharp':
      return `using Replane;

// Create and configure the client
var client = new ReplaneClient();

// Connect to the Replane server
await client.ConnectAsync(new ConnectOptions
{
    BaseUrl = "${baseUrl}",
    SdkKey = "${sdkKey}"
});

// Get config value
var config = client.Get<string>("${exampleConfigName}");

// Configs are automatically updated in realtime via SSE
// No need to refetch or reload - just call Get() again

// Clean up when your application shuts down
await client.DisposeAsync();`;

    default:
      return '';
  }
}

/**
 * Generates the usage code snippet with codegen types.
 */
export function generateUsageSnippetWithCodegen(params: {
  language: SdkLanguage;
  sdkKey: string;
  baseUrl: string;
  exampleConfigName: string;
  configNames: string[];
}): string {
  const {language, sdkKey, baseUrl, exampleConfigName, configNames} = params;

  // Get a sample of config names to show in the example (max 3)
  const sampleConfigs = configNames.slice(0, 3);

  switch (language) {
    case 'javascript':
      return `import { Replane } from '@replanejs/sdk';
import { type Configs } from './types';

// Create client with generated types for full type safety
const replane = new Replane<Configs>();

// Connect to the server (fetches project's configs during initialization)
await replane.connect({
    sdkKey: '${sdkKey}',
    baseUrl: '${baseUrl}',
});

// Get config value with full type safety
// The return type is automatically inferred from your Configs interface
const ${toCamelCase(exampleConfigName)} = replane.get('${exampleConfigName}');
${sampleConfigs
  .filter(name => name !== exampleConfigName)
  .slice(0, 2)
  .map(name => `const ${toCamelCase(name)} = replane.get('${name}');`)
  .join('\n')}

// Configs are automatically updated in realtime via SSE
// No need to refetch or reload - just call get() again

// Clean up when your application shuts down
replane.disconnect();`;

    case 'python':
      return `from replane import Replane
from replane_types import Configs

# Using context manager (recommended)
with Replane[Configs](
    base_url="${baseUrl}",
    sdk_key="${sdkKey}",
) as client:
    # Access configs with full type safety using .configs
    ${toSnakeCase(exampleConfigName)} = client.configs["${exampleConfigName}"]
${sampleConfigs
  .filter(name => name !== exampleConfigName)
  .slice(0, 1)
  .map(name => `    ${toSnakeCase(name)} = client.configs["${name}"]`)
  .join('\n')}

    # Access typed properties using bracket notation
    # print(${toSnakeCase(exampleConfigName)}["some_property"])

    # Configs are automatically updated in realtime via SSE
    # No need to refetch - just access .configs again`;

    case 'csharp':
      return `using Replane;
using Replane.Generated;

// Create and configure the client
var client = new ReplaneClient();

// Connect to the Replane server
await client.ConnectAsync(new ConnectOptions
{
    BaseUrl = "${baseUrl}",
    SdkKey = "${sdkKey}"
});

// Get config value with generated types for full type safety
var ${toCamelCase(exampleConfigName)} = client.Get<${toPascalCase(exampleConfigName)}>("${exampleConfigName}");
${sampleConfigs
  .filter(name => name !== exampleConfigName)
  .slice(0, 2)
  .map(name => `var ${toCamelCase(name)} = client.Get<${toPascalCase(name)}>("${name}");`)
  .join('\n')}

// Access typed properties
// Console.WriteLine(${toCamelCase(exampleConfigName)}.SomeProperty);

// Configs are automatically updated in realtime via SSE
// No need to refetch or reload - just call Get() again

// Clean up when your application shuts down
await client.DisposeAsync();`;

    default:
      return '';
  }
}

/**
 * Generates the types file name suggestion for a given SDK language.
 */
export function getTypesFileName(language: SdkLanguage): string {
  switch (language) {
    case 'javascript':
      return 'types.ts';
    case 'python':
      return 'replane_types.py';
    case 'csharp':
      return 'ReplaneTypes.cs';
    default:
      return 'types';
  }
}

/**
 * Convert a kebab-case or snake_case string to camelCase.
 */
function toCamelCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, (_, char) => char.toLowerCase());
}

/**
 * Convert a kebab-case or snake_case string to PascalCase.
 */
function toPascalCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, (_, char) => char.toUpperCase());
}

/**
 * Convert a kebab-case string to snake_case.
 */
function toSnakeCase(str: string): string {
  return str.replace(/-/g, '_');
}
