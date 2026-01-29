/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import {
  getSettingsSchema,
  type SettingDefinition,
  type SettingCollectionDefinition,
  SETTINGS_SCHEMA_DEFINITIONS,
} from './settingsSchema.js';

/**
 * Calculates the Levenshtein distance between two strings.
 * This measures the minimum number of single-character edits (insertions,
 * deletions, or substitutions) required to transform one string into another.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize the matrix
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Recursively finds unknown keys in the settings data.
 * Returns an array of { path, unknownKey, validKeys } objects.
 */
function findUnknownKeys(
  data: Record<string, unknown>,
  schema: Record<string, SettingDefinition>,
  prefix = '',
): Array<{ path: string; unknownKey: string; validKeys: string[] }> {
  const unknown: Array<{
    path: string;
    unknownKey: string;
    validKeys: string[];
  }> = [];
  const validKeysAtThisLevel = Object.keys(schema);

  for (const key of Object.keys(data)) {
    if (!(key in schema)) {
      unknown.push({
        path: prefix || '(root)',
        unknownKey: key,
        validKeys: validKeysAtThisLevel,
      });
    } else {
      const definition = schema[key];
      const value = data[key];
      // Recurse into nested objects
      if (
        definition.type === 'object' &&
        definition.properties &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        const nestedPath = prefix ? `${prefix}.${key}` : key;
        const nested = findUnknownKeys(
          value as Record<string, unknown>,
          definition.properties as Record<string, SettingDefinition>,
          nestedPath,
        );
        unknown.push(...nested);
      }
    }
  }

  return unknown;
}

/**
 * Threshold for considering a key as a potential typo.
 * A Levenshtein distance of 1-2 typically indicates a typo.
 */
const TYPO_DISTANCE_THRESHOLD = 2;

export interface TypoWarning {
  path: string;
  unknownKey: string;
  suggestedKey: string;
  distance: number;
}

/**
 * Detects potential typos in settings by finding unknown keys that are
 * similar to valid keys using Levenshtein distance.
 */
export function detectSettingsTypos(data: unknown): TypoWarning[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return [];
  }

  const schema = getSettingsSchema() as Record<string, SettingDefinition>;
  const unknownKeys = findUnknownKeys(data as Record<string, unknown>, schema);
  const warnings: TypoWarning[] = [];

  for (const { path, unknownKey, validKeys } of unknownKeys) {
    let bestMatch: { key: string; distance: number } | null = null;

    for (const validKey of validKeys) {
      const distance = levenshteinDistance(
        unknownKey.toLowerCase(),
        validKey.toLowerCase(),
      );

      if (
        distance <= TYPO_DISTANCE_THRESHOLD &&
        (!bestMatch || distance < bestMatch.distance)
      ) {
        bestMatch = { key: validKey, distance };
      }
    }

    if (bestMatch) {
      warnings.push({
        path,
        unknownKey,
        suggestedKey: bestMatch.key,
        distance: bestMatch.distance,
      });
    }
  }

  return warnings;
}

/**
 * Formats typo warnings into a human-readable message.
 */
export function formatTypoWarnings(warnings: TypoWarning[]): string {
  if (warnings.length === 0) {
    return '';
  }

  const lines: string[] = ['Possible typos detected in settings:'];

  for (const warning of warnings) {
    const location = warning.path === '(root)' ? '' : `${warning.path}.`;
    lines.push(
      `  - "${location}${warning.unknownKey}" - did you mean "${location}${warning.suggestedKey}"?`,
    );
  }

  return lines.join('\n');
}

// Helper to build Zod schema from the JSON-schema-like definitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildZodSchemaFromJsonSchema(def: any): z.ZodTypeAny {
  if (def.anyOf) {
    return z.union(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      def.anyOf.map((d: any) => buildZodSchemaFromJsonSchema(d)),
    );
  }

  if (def.type === 'string') {
    if (def.enum) return z.enum(def.enum as [string, ...string[]]);
    return z.string();
  }
  if (def.type === 'number') return z.number();
  if (def.type === 'boolean') return z.boolean();

  if (def.type === 'array') {
    if (def.items) {
      return z.array(buildZodSchemaFromJsonSchema(def.items));
    }
    return z.array(z.unknown());
  }

  if (def.type === 'object') {
    const shape: Record<string, z.ZodTypeAny> = {};
    if (def.properties) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const [key, propDef] of Object.entries(def.properties) as any) {
        let propSchema = buildZodSchemaFromJsonSchema(propDef);
        if (
          def.required &&
          Array.isArray(def.required) &&
          def.required.includes(key)
        ) {
          // keep it required
        } else {
          propSchema = propSchema.optional();
        }
        shape[key] = propSchema;
      }
    }

    // Build object schema and apply the appropriate additional properties handling.
    // These methods are mutually exclusive, so we apply exactly one.
    const baseSchema = z.object(shape);

    if (typeof def.additionalProperties === 'object') {
      // additionalProperties is a schema - use catchall to validate additional props
      return baseSchema.catchall(
        buildZodSchemaFromJsonSchema(def.additionalProperties),
      );
    }

    // For both additionalProperties: false and additionalProperties: undefined,
    // use passthrough to allow unknown keys silently. This enables forward
    // compatibility when users have deprecated keys or typos in their settings.
    return baseSchema.passthrough();
  }

  return z.unknown();
}

/**
 * Builds a Zod enum schema from options array
 */
function buildEnumSchema(
  options: ReadonlyArray<{ value: string | number | boolean; label: string }>,
): z.ZodTypeAny {
  if (!options || options.length === 0) {
    throw new Error(
      `Enum type must have options defined. Check your settings schema definition.`,
    );
  }
  const values = options.map((opt) => opt.value);
  if (values.every((v) => typeof v === 'string')) {
    return z.enum(values as [string, ...string[]]);
  } else if (values.every((v) => typeof v === 'number')) {
    return z.union(
      values.map((v) => z.literal(v)) as [
        z.ZodLiteral<number>,
        z.ZodLiteral<number>,
        ...Array<z.ZodLiteral<number>>,
      ],
    );
  } else {
    return z.union(
      values.map((v) => z.literal(v)) as [
        z.ZodLiteral<unknown>,
        z.ZodLiteral<unknown>,
        ...Array<z.ZodLiteral<unknown>>,
      ],
    );
  }
}

/**
 * Builds a Zod object shape from properties record
 */
function buildObjectShapeFromProperties(
  properties: Record<string, SettingDefinition>,
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, childDef] of Object.entries(properties)) {
    shape[key] = buildZodSchemaFromDefinition(childDef);
  }
  return shape;
}

/**
 * Builds a Zod schema for primitive types (string, number, boolean)
 */
function buildPrimitiveSchema(
  type: 'string' | 'number' | 'boolean',
): z.ZodTypeAny {
  switch (type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    default:
      return z.unknown();
  }
}

const REF_SCHEMAS: Record<string, z.ZodTypeAny> = {};

// Initialize REF_SCHEMAS
for (const [name, def] of Object.entries(SETTINGS_SCHEMA_DEFINITIONS)) {
  REF_SCHEMAS[name] = buildZodSchemaFromJsonSchema(def);
}

/**
 * Recursively builds a Zod schema from a SettingDefinition
 */
function buildZodSchemaFromDefinition(
  definition: SettingDefinition,
): z.ZodTypeAny {
  let baseSchema: z.ZodTypeAny;

  // Special handling for TelemetrySettings which can be boolean or object
  if (definition.ref === 'TelemetrySettings') {
    const objectSchema = REF_SCHEMAS['TelemetrySettings'];
    if (objectSchema) {
      return z.union([z.boolean(), objectSchema]).optional();
    }
  }

  // Handle refs using registry
  if (definition.ref && definition.ref in REF_SCHEMAS) {
    return REF_SCHEMAS[definition.ref].optional();
  }

  switch (definition.type) {
    case 'string':
    case 'number':
    case 'boolean':
      baseSchema = buildPrimitiveSchema(definition.type);
      break;

    case 'enum': {
      baseSchema = buildEnumSchema(definition.options!);
      break;
    }

    case 'array':
      if (definition.items) {
        const itemSchema = buildZodSchemaFromCollection(definition.items);
        baseSchema = z.array(itemSchema);
      } else {
        baseSchema = z.array(z.unknown());
      }
      break;

    case 'object':
      if (definition.properties) {
        const shape = buildObjectShapeFromProperties(definition.properties);
        baseSchema = z.object(shape).passthrough();

        if (definition.additionalProperties) {
          const additionalSchema = buildZodSchemaFromCollection(
            definition.additionalProperties,
          );
          baseSchema = z.object(shape).catchall(additionalSchema);
        }
      } else if (definition.additionalProperties) {
        const valueSchema = buildZodSchemaFromCollection(
          definition.additionalProperties,
        );
        baseSchema = z.record(z.string(), valueSchema);
      } else {
        baseSchema = z.record(z.string(), z.unknown());
      }
      break;

    default:
      baseSchema = z.unknown();
  }

  // Make all fields optional since settings are partial
  return baseSchema.optional();
}

/**
 * Builds a Zod schema from a SettingCollectionDefinition
 */
function buildZodSchemaFromCollection(
  collection: SettingCollectionDefinition,
): z.ZodTypeAny {
  if (collection.ref && collection.ref in REF_SCHEMAS) {
    return REF_SCHEMAS[collection.ref];
  }

  switch (collection.type) {
    case 'string':
    case 'number':
    case 'boolean':
      return buildPrimitiveSchema(collection.type);

    case 'enum': {
      return buildEnumSchema(collection.options!);
    }

    case 'array':
      if (collection.properties) {
        const shape = buildObjectShapeFromProperties(collection.properties);
        return z.array(z.object(shape));
      }
      return z.array(z.unknown());

    case 'object':
      if (collection.properties) {
        const shape = buildObjectShapeFromProperties(collection.properties);
        return z.object(shape).passthrough();
      }
      return z.record(z.string(), z.unknown());

    default:
      return z.unknown();
  }
}

/**
 * Builds the complete Zod schema for Settings from SETTINGS_SCHEMA
 */
function buildSettingsZodSchema(): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const schema = getSettingsSchema();
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, definition] of Object.entries(schema)) {
    shape[key] = buildZodSchemaFromDefinition(definition);
  }

  return z.object(shape).passthrough();
}

export const settingsZodSchema = buildSettingsZodSchema();

/**
 * Validates settings data against the Zod schema
 */
export function validateSettings(data: unknown): {
  success: boolean;
  data?: unknown;
  error?: z.ZodError;
} {
  const result = settingsZodSchema.safeParse(data);
  return result;
}

/**
 * Format a Zod error into a helpful error message
 */
export function formatValidationError(
  error: z.ZodError,
  filePath: string,
): string {
  const lines: string[] = [];
  lines.push(`Invalid configuration in ${filePath}:`);
  lines.push('');

  const MAX_ERRORS_TO_DISPLAY = 5;
  const displayedIssues = error.issues.slice(0, MAX_ERRORS_TO_DISPLAY);

  for (const issue of displayedIssues) {
    const path = issue.path.reduce(
      (acc, curr) =>
        typeof curr === 'number'
          ? `${acc}[${curr}]`
          : `${acc ? acc + '.' : ''}${curr}`,
      '',
    );
    lines.push(`Error in: ${path || '(root)'}`);
    lines.push(`    ${issue.message}`);

    if (issue.code === 'invalid_type') {
      const expected = issue.expected;
      const received = issue.received;
      lines.push(`Expected: ${expected}, but received: ${received}`);
    }
    lines.push('');
  }

  if (error.issues.length > MAX_ERRORS_TO_DISPLAY) {
    lines.push(
      `...and ${error.issues.length - MAX_ERRORS_TO_DISPLAY} more errors.`,
    );
    lines.push('');
  }

  lines.push('Please fix the configuration.');
  lines.push(
    'See: https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/configuration.md',
  );

  return lines.join('\n');
}
