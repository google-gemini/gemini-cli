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
  SETTINGS_SCHEMA_DEFINITIONS,
  type SettingsJsonSchemaDefinition,
} from '../packages/cli/src/config/settingsSchema.js';
import {
  formatDefaultValue,
  formatWithPrettier,
  normalizeForCompare,
} from './utils/autogen.js';

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
  anyOf?: JsonSchema[];
}

interface GenerateOptions {
  checkOnly: boolean;
}

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
  const defs = new Map<string, JsonSchema>(
    Object.entries(SETTINGS_SCHEMA_DEFINITIONS as Record<string, JsonSchema>),
  );

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

  const schemaShape = definition.ref
    ? buildRefSchema(definition.ref, defs)
    : buildSchemaForType(definition, pathSegments, defs);

  return { ...base, ...schemaShape };
}

function buildCollectionSchema(
  collection: SettingCollectionDefinition,
  pathSegments: string[],
  defs: Map<string, JsonSchema>,
): JsonSchema {
  if (collection.ref) {
    return buildRefSchema(collection.ref, defs);
  }
  return buildSchemaForType(collection, pathSegments, defs);
}

function buildSchemaForType(
  source: SettingDefinition | SettingCollectionDefinition,
  pathSegments: string[],
  defs: Map<string, JsonSchema>,
): JsonSchema {
  switch (source.type) {
    case 'boolean':
    case 'string':
    case 'number':
      return { type: source.type };
    case 'enum':
      return buildEnumSchema(source.options);
    case 'array': {
      const itemPath = [...pathSegments, '<items>'];
      const items = isSettingDefinition(source)
        ? source.items
          ? buildCollectionSchema(source.items, itemPath, defs)
          : {}
        : source.properties
          ? buildInlineObjectSchema(source.properties, itemPath, defs)
          : {};
      return { type: 'array', items };
    }
    case 'object':
      return isSettingDefinition(source)
        ? buildObjectDefinitionSchema(source, pathSegments, defs)
        : buildObjectCollectionSchema(source, pathSegments, defs);
    default:
      return {};
  }
}

function buildEnumSchema(
  options:
    | SettingDefinition['options']
    | SettingCollectionDefinition['options'],
): JsonSchema {
  const values = options?.map((option) => option.value) ?? [];
  const inferred = inferTypeFromValues(values);
  return {
    type: inferred ?? undefined,
    enum: values,
  };
}

function buildObjectDefinitionSchema(
  definition: SettingDefinition,
  pathSegments: string[],
  defs: Map<string, JsonSchema>,
): JsonSchema {
  const properties = definition.properties
    ? buildObjectProperties(definition.properties, pathSegments, defs)
    : undefined;

  const schema: JsonSchema = {
    type: 'object',
  };

  if (properties && Object.keys(properties).length > 0) {
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

function buildObjectCollectionSchema(
  collection: SettingCollectionDefinition,
  pathSegments: string[],
  defs: Map<string, JsonSchema>,
): JsonSchema {
  if (collection.properties) {
    return buildInlineObjectSchema(collection.properties, pathSegments, defs);
  }
  return { type: 'object', additionalProperties: true };
}

function buildObjectProperties(
  properties: SettingsSchema,
  pathSegments: string[],
  defs: Map<string, JsonSchema>,
): Record<string, JsonSchema> {
  const result: Record<string, JsonSchema> = {};
  for (const [childKey, childDefinition] of Object.entries(properties)) {
    result[childKey] = buildSettingSchema(
      childDefinition,
      [...pathSegments, childKey],
      defs,
    );
  }
  return result;
}

function buildInlineObjectSchema(
  properties: SettingsSchema,
  pathSegments: string[],
  defs: Map<string, JsonSchema>,
): JsonSchema {
  const childSchemas = buildObjectProperties(properties, pathSegments, defs);
  return {
    type: 'object',
    properties: childSchemas,
    additionalProperties: false,
  };
}

function buildRefSchema(
  ref: string,
  defs: Map<string, JsonSchema>,
): JsonSchema {
  ensureDefinition(ref, defs);
  return { $ref: `#/$defs/${ref}` };
}

function isSettingDefinition(
  source: SettingDefinition | SettingCollectionDefinition,
): source is SettingDefinition {
  return 'label' in source;
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
    lines.push(`- Default: \`${formatDefaultValue(definition.default)}\``);
  }

  return lines.join('\n');
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
  const predefined = SETTINGS_SCHEMA_DEFINITIONS[ref] as
    | SettingsJsonSchemaDefinition
    | undefined;
  if (predefined) {
    defs.set(ref, predefined as JsonSchema);
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
