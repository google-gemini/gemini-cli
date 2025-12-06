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

// Helper to build Zod schema from the JSON-schema-like definitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildZodSchemaFromJsonSchema(def: any): z.ZodTypeAny {
  if (def.anyOf) {
    return z.union(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      def.anyOf.map((d: any) => buildZodSchemaFromJsonSchema(d)) as any,
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
    let schema;
    if (def.properties) {
      const shape: Record<string, z.ZodTypeAny> = {};
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
      schema = z.object(shape).passthrough();
    } else {
      schema = z.object({}).passthrough();
    }

    if (def.additionalProperties === false) {
      schema = schema.strict();
    } else if (typeof def.additionalProperties === 'object') {
      schema = schema.catchall(
        buildZodSchemaFromJsonSchema(def.additionalProperties),
      );
    }

    return schema;
  }

  return z.unknown();
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
  if (collection.ref && collection.ref in REF_SCHEMAS) {
    return REF_SCHEMAS[collection.ref];
  }

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

  lines.push('Please fix the configuration and try again.');
  lines.push(
    'See: https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/configuration.md',
  );

  return lines.join('\n');
}
