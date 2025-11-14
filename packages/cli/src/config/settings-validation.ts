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
} from './settingsSchema.js';

/**
 * Registry of union types that combine multiple Zod schemas.
 * These correspond to ref types in settingsSchema.ts that use anyOf.
 */
const UNION_TYPE_SCHEMAS: Record<string, z.ZodTypeAny> = {
  /**
   * Accepts either a boolean flag or a string command name.
   * Example: tools.sandbox can be true/false or a path string.
   */
  BooleanOrString: z.union([z.boolean(), z.string()]),

  /**
   * Accepts either a single string or an array of strings.
   * Example: context.fileName can be "*.ts" or ["*.ts", "*.tsx"]
   */
  StringOrStringArray: z.union([z.string(), z.array(z.string())]),
};

/**
 * Recursively builds a Zod schema from a SettingDefinition
 */
function buildZodSchemaFromDefinition(
  definition: SettingDefinition,
): z.ZodTypeAny {
  let baseSchema: z.ZodTypeAny;

  // Handle union types using registry
  if (definition.ref && definition.ref in UNION_TYPE_SCHEMAS) {
    return UNION_TYPE_SCHEMAS[definition.ref].optional();
  }

  // Handle telemetry which can be boolean (false to disable) or TelemetrySettings object
  if (definition.ref === 'TelemetrySettings' && definition.type === 'object') {
    if (definition.properties) {
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, childDef] of Object.entries(definition.properties)) {
        shape[key] = buildZodSchemaFromDefinition(childDef);
      }
      const objectSchema = z.object(shape).passthrough();
      baseSchema = z.union([z.boolean(), objectSchema]);
      return baseSchema.optional();
    } else {
      // No properties defined, use record for object schema
      const objectSchema = z.record(z.string(), z.unknown());
      baseSchema = z.union([z.boolean(), objectSchema]);
      return baseSchema.optional();
    }
  }

  switch (definition.type) {
    case 'string':
      baseSchema = z.string();
      break;

    case 'number':
      baseSchema = z.number();
      break;

    case 'boolean':
      baseSchema = z.boolean();
      break;

    case 'enum': {
      if (!definition.options || definition.options.length === 0) {
        throw new Error(
          `Enum type must have options defined. Check your settings schema definition.`,
        );
      }
      const values = definition.options.map((opt) => opt.value);
      if (values.every((v) => typeof v === 'string')) {
        baseSchema = z.enum(values as [string, ...string[]]);
      } else if (values.every((v) => typeof v === 'number')) {
        baseSchema = z.union(
          values.map((v) => z.literal(v)) as [
            z.ZodLiteral<number>,
            z.ZodLiteral<number>,
            ...Array<z.ZodLiteral<number>>,
          ],
        );
      } else {
        baseSchema = z.union(
          values.map((v) => z.literal(v)) as [
            z.ZodLiteral<unknown>,
            z.ZodLiteral<unknown>,
            ...Array<z.ZodLiteral<unknown>>,
          ],
        );
      }
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
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const [key, childDef] of Object.entries(definition.properties)) {
          shape[key] = buildZodSchemaFromDefinition(childDef);
        }
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
  switch (collection.type) {
    case 'string':
      return z.string();

    case 'number':
      return z.number();

    case 'boolean':
      return z.boolean();

    case 'enum': {
      if (!collection.options || collection.options.length === 0) {
        throw new Error(
          `Enum type must have options defined. Check your settings schema definition.`,
        );
      }
      const values = collection.options.map((opt) => opt.value);
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

    case 'array':
      if (collection.properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const [key, childDef] of Object.entries(collection.properties)) {
          shape[key] = buildZodSchemaFromDefinition(childDef);
        }
        return z.array(z.object(shape));
      }
      return z.array(z.unknown());

    case 'object':
      if (collection.properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const [key, childDef] of Object.entries(collection.properties)) {
          shape[key] = buildZodSchemaFromDefinition(childDef);
        }
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

  for (const issue of error.issues) {
    const path = issue.path.join('.');
    lines.push(`Error in: ${path || '(root)'}`);
    lines.push(`    ${issue.message}`);

    if (issue.code === 'invalid_type') {
      const expected = issue.expected;
      const received = issue.received;
      lines.push(`Expected: ${expected}, but received: ${received}`);
    }
    lines.push('');
  }

  lines.push('Please fix the configuration and try again.');
  lines.push(
    'See: https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/configuration.md',
  );

  return lines.join('\n');
}
