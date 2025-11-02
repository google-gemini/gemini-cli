/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import {
  getSettingsSchema,
  type SettingCollectionDefinition,
  type SettingDefinition,
  type SettingsSchema,
  type SettingsSchemaType,
} from '../packages/cli/src/config/settingsSchema.js';
import { formatWithPrettier, normalizeForCompare } from './utils/autogen.js';

const OUTPUT_RELATIVE_PATH = ['schemas', 'settings.schema.json'];
const SCHEMA_ID =
  'https://raw.githubusercontent.com/google-gemini/gemini-cli/main/schemas/settings.schema.json';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface JsonSchema {
  [key: string]: JsonValue | JsonSchema | JsonSchema[] | undefined;
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  markdownDescription?: string;
  type?: string | string[];
  enum?: JsonPrimitive[];
  default?: JsonValue;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  required?: string[];
  $ref?: string;
}

interface GenerateOptions {
  checkOnly: boolean;
}

const CUSTOM_DEFINITIONS: Record<string, JsonSchema> = {
  MCPServerConfig: {
    type: 'object',
    description:
      'Definition of a Model Context Protocol (MCP) server configuration.',
    additionalProperties: false,
    properties: {
      command: {
        type: 'string',
        description: 'Executable invoked for stdio transport.',
      },
      args: {
        type: 'array',
        description: 'Command-line arguments for the stdio transport command.',
        items: { type: 'string' },
      },
      env: {
        type: 'object',
        description: 'Environment variables to set for the server process.',
        additionalProperties: { type: 'string' },
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the server process.',
      },
      url: {
        type: 'string',
        description: 'SSE transport URL.',
      },
      httpUrl: {
        type: 'string',
        description: 'Streaming HTTP transport URL.',
      },
      headers: {
        type: 'object',
        description: 'Additional HTTP headers sent to the server.',
        additionalProperties: { type: 'string' },
      },
      tcp: {
        type: 'string',
        description: 'TCP address for websocket transport.',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds for MCP requests.',
      },
      trust: {
        type: 'boolean',
        description:
          'Marks the server as trusted. Trusted servers may gain additional capabilities.',
      },
      description: {
        type: 'string',
        description: 'Human-readable description of the server.',
      },
      includeTools: {
        type: 'array',
        description:
          'Subset of tools that should be enabled for this server. When omitted all tools are enabled.',
        items: { type: 'string' },
      },
      excludeTools: {
        type: 'array',
        description:
          'Tools that should be disabled for this server even if exposed.',
        items: { type: 'string' },
      },
      extension: {
        type: 'object',
        description:
          'Metadata describing the Gemini CLI extension that owns this MCP server.',
        additionalProperties: { type: ['string', 'boolean', 'number'] },
      },
      oauth: {
        type: 'object',
        description: 'OAuth configuration for authenticating with the server.',
        additionalProperties: true,
      },
      authProviderType: {
        type: 'string',
        description:
          'Authentication provider used for acquiring credentials (for example `dynamic_discovery`).',
        enum: [
          'dynamic_discovery',
          'google_credentials',
          'service_account_impersonation',
        ],
      },
      targetAudience: {
        type: 'string',
        description:
          'OAuth target audience (CLIENT_ID.apps.googleusercontent.com).',
      },
      targetServiceAccount: {
        type: 'string',
        description:
          'Service account email to impersonate (name@project.iam.gserviceaccount.com).',
      },
    },
  },
  TelemetrySettings: {
    type: 'object',
    description: 'Telemetry configuration for Gemini CLI.',
    additionalProperties: false,
    properties: {
      enabled: {
        type: 'boolean',
        description: 'Enables telemetry emission.',
      },
      target: {
        type: 'string',
        description:
          'Telemetry destination (for example `stderr`, `stdout`, or `otlp`).',
      },
      otlpEndpoint: {
        type: 'string',
        description: 'Endpoint for OTLP exporters.',
      },
      otlpProtocol: {
        type: 'string',
        description: 'Protocol for OTLP exporters.',
        enum: ['grpc', 'http'],
      },
      logPrompts: {
        type: 'boolean',
        description: 'Whether prompts are logged in telemetry payloads.',
      },
      outfile: {
        type: 'string',
        description: 'File path for writing telemetry output.',
      },
      useCollector: {
        type: 'boolean',
        description: 'Whether to forward telemetry to an OTLP collector.',
      },
    },
  },
  BugCommandSettings: {
    type: 'object',
    description: 'Configuration for the bug report helper command.',
    additionalProperties: false,
    properties: {
      urlTemplate: {
        type: 'string',
        description:
          'Template used to open a bug report URL. Variables in the template are populated at runtime.',
      },
    },
    required: ['urlTemplate'],
  },
  SummarizeToolOutputSettings: {
    type: 'object',
    description:
      'Controls summarization behavior for individual tools. All properties are optional.',
    additionalProperties: false,
    properties: {
      tokenBudget: {
        type: 'number',
        description:
          'Maximum number of tokens used when summarizing tool output.',
      },
    },
  },
  CustomTheme: {
    type: 'object',
    description:
      'Custom theme definition used for styling Gemini CLI output. Colors are provided as hex strings or named ANSI colors.',
    additionalProperties: false,
    properties: {
      type: {
        type: 'string',
        enum: ['custom'],
        default: 'custom',
      },
      name: {
        type: 'string',
        description: 'Theme display name.',
      },
      text: {
        type: 'object',
        additionalProperties: false,
        properties: {
          primary: { type: 'string' },
          secondary: { type: 'string' },
          link: { type: 'string' },
          accent: { type: 'string' },
        },
      },
      background: {
        type: 'object',
        additionalProperties: false,
        properties: {
          primary: { type: 'string' },
          diff: {
            type: 'object',
            additionalProperties: false,
            properties: {
              added: { type: 'string' },
              removed: { type: 'string' },
            },
          },
        },
      },
      border: {
        type: 'object',
        additionalProperties: false,
        properties: {
          default: { type: 'string' },
          focused: { type: 'string' },
        },
      },
      ui: {
        type: 'object',
        additionalProperties: false,
        properties: {
          comment: { type: 'string' },
          symbol: { type: 'string' },
          gradient: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      status: {
        type: 'object',
        additionalProperties: false,
        properties: {
          error: { type: 'string' },
          success: { type: 'string' },
          warning: { type: 'string' },
        },
      },
      Background: { type: 'string' },
      Foreground: { type: 'string' },
      LightBlue: { type: 'string' },
      AccentBlue: { type: 'string' },
      AccentPurple: { type: 'string' },
      AccentCyan: { type: 'string' },
      AccentGreen: { type: 'string' },
      AccentYellow: { type: 'string' },
      AccentRed: { type: 'string' },
      DiffAdded: { type: 'string' },
      DiffRemoved: { type: 'string' },
      Comment: { type: 'string' },
      Gray: { type: 'string' },
      DarkGray: { type: 'string' },
      GradientColors: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['type', 'name'],
  },
};

export async function generateSettingsSchema(
  options: GenerateOptions,
): Promise<void> {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const outputPath = path.join(repoRoot, ...OUTPUT_RELATIVE_PATH);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const schemaObject = buildSchemaObject(getSettingsSchema());
  const formatted = await formatWithPrettier(
    JSON.stringify(schemaObject, null, 2),
    outputPath,
  );

  let existing: string | undefined;
  try {
    existing = await readFile(outputPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  if (
    existing &&
    normalizeForCompare(existing) === normalizeForCompare(formatted)
  ) {
    if (!options.checkOnly) {
      console.log('Settings JSON schema already up to date.');
    }
    return;
  }

  if (options.checkOnly) {
    console.error(
      'Settings JSON schema is out of date. Run `npm run schema:settings` to regenerate.',
    );
    process.exitCode = 1;
    return;
  }

  await writeFile(outputPath, formatted);
  console.log('Settings JSON schema regenerated.');
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const checkOnly = argv.includes('--check');
  await generateSettingsSchema({ checkOnly });
}

function buildSchemaObject(schema: SettingsSchemaType): JsonSchema {
  const defs = new Map<string, JsonSchema>(Object.entries(CUSTOM_DEFINITIONS));

  const root: JsonSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: SCHEMA_ID,
    title: 'Gemini CLI Settings',
    description:
      'Configuration file schema for Gemini CLI settings. This schema enables IDE completion for `settings.json`.',
    type: 'object',
    additionalProperties: false,
    properties: {},
  };

  for (const [key, definition] of Object.entries(schema)) {
    root.properties![key] = buildSettingSchema(definition, [key], defs);
  }

  if (defs.size > 0) {
    root.$defs = Object.fromEntries(defs.entries());
  }

  return root;
}

function buildSettingSchema(
  definition: SettingDefinition,
  pathSegments: string[],
  defs: Map<string, JsonSchema>,
): JsonSchema {
  const base: JsonSchema = {
    title: definition.label,
    description: definition.description,
    markdownDescription: buildMarkdownDescription(definition),
  };

  if (definition.default !== undefined) {
    base.default = definition.default as JsonValue;
  }

  if (definition.ref) {
    ensureDefinition(definition.ref, defs);
    return { ...base, $ref: `#/$defs/${definition.ref}` };
  }

  switch (definition.type) {
    case 'boolean':
    case 'string':
    case 'number':
      return { ...base, type: definition.type };
    case 'enum': {
      const values = definition.options?.map((option) => option.value) ?? [];
      const inferred = inferTypeFromValues(values);
      return {
        ...base,
        type: inferred ?? undefined,
        enum: values,
      };
    }
    case 'array': {
      const items = definition.items
        ? buildCollectionSchema(
            definition.items,
            [...pathSegments, '<items>'],
            defs,
          )
        : {};
      return { ...base, type: 'array', items };
    }
    case 'object': {
      const properties: Record<string, JsonSchema> = {};
      if (definition.properties) {
        for (const [childKey, childDefinition] of Object.entries(
          definition.properties,
        )) {
          properties[childKey] = buildSettingSchema(
            childDefinition,
            [...pathSegments, childKey],
            defs,
          );
        }
      }

      const schema: JsonSchema = {
        ...base,
        type: 'object',
      };

      if (Object.keys(properties).length > 0) {
        schema.properties = properties;
      }

      if (definition.additionalProperties) {
        schema.additionalProperties = buildCollectionSchema(
          definition.additionalProperties,
          [...pathSegments, '<additionalProperties>'],
          defs,
        );
      } else if (!definition.properties) {
        schema.additionalProperties = true;
      } else {
        schema.additionalProperties = false;
      }

      return schema;
    }
    default:
      return base;
  }
}

function buildCollectionSchema(
  collection: SettingCollectionDefinition,
  pathSegments: string[],
  defs: Map<string, JsonSchema>,
): JsonSchema {
  if (collection.ref) {
    ensureDefinition(collection.ref, defs);
    return { $ref: `#/$defs/${collection.ref}` };
  }

  switch (collection.type) {
    case 'boolean':
    case 'string':
    case 'number':
      return { type: collection.type };
    case 'enum': {
      const values = collection.options?.map((option) => option.value) ?? [];
      const inferred = inferTypeFromValues(values);
      return {
        type: inferred ?? undefined,
        enum: values,
      };
    }
    case 'array': {
      const items = collection.properties
        ? buildInlineObjectSchema(
            collection.properties,
            [...pathSegments, '<items>'],
            defs,
          )
        : {};
      return { type: 'array', items };
    }
    case 'object': {
      if (collection.properties) {
        return buildInlineObjectSchema(
          collection.properties,
          pathSegments,
          defs,
        );
      }
      return { type: 'object', additionalProperties: true };
    }
    default:
      return {};
  }
}

function buildInlineObjectSchema(
  properties: SettingsSchema,
  pathSegments: string[],
  defs: Map<string, JsonSchema>,
): JsonSchema {
  const childSchemas: Record<string, JsonSchema> = {};
  for (const [childKey, childDefinition] of Object.entries(properties)) {
    childSchemas[childKey] = buildSettingSchema(
      childDefinition,
      [...pathSegments, childKey],
      defs,
    );
  }

  return {
    type: 'object',
    properties: childSchemas,
    additionalProperties: false,
  };
}

function buildMarkdownDescription(definition: SettingDefinition): string {
  const lines: string[] = [];

  if (definition.description?.trim()) {
    lines.push(definition.description.trim());
  } else {
    lines.push('Description not provided.');
  }

  lines.push('');
  lines.push(`- Category: \`${definition.category}\``);
  lines.push(
    `- Requires restart: \`${definition.requiresRestart ? 'yes' : 'no'}\``,
  );

  if (definition.default !== undefined) {
    lines.push(`- Default: \`${formatDefault(definition.default)}\``);
  }

  return lines.join('\n');
}

function formatDefault(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function inferTypeFromValues(
  values: Array<string | number>,
): string | undefined {
  if (values.length === 0) {
    return undefined;
  }
  if (values.every((value) => typeof value === 'string')) {
    return 'string';
  }
  if (values.every((value) => typeof value === 'number')) {
    return 'number';
  }
  return undefined;
}

function ensureDefinition(ref: string, defs: Map<string, JsonSchema>): void {
  if (defs.has(ref)) {
    return;
  }
  const predefined = CUSTOM_DEFINITIONS[ref];
  if (predefined) {
    defs.set(ref, predefined);
  } else {
    defs.set(ref, { description: `Definition for ${ref}` });
  }
}

if (process.argv[1]) {
  const entryUrl = pathToFileURL(path.resolve(process.argv[1])).href;
  if (entryUrl === import.meta.url) {
    await main();
  }
}
