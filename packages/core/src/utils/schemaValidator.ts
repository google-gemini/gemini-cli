/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import AjvPkg, { type AnySchema, type Ajv } from 'ajv';
// Ajv2020 is the documented way to use draft-2020-12: https://ajv.js.org/json-schema.html#draft-2020-12
// eslint-disable-next-line import/no-internal-modules
import Ajv2020Pkg from 'ajv/dist/2020.js';
import addFormatsPkg from 'ajv-formats';
import { debugLogger } from './debugLogger.js';

// At runtime, default imports from CJS modules may be double-wrapped as
// { default: ActualExport } depending on the bundler/runtime. These helpers
// resolve the actual export using type guards for runtime type safety.

/** Constructor type compatible with Ajv classes. */
type AjvCtorLike = new (opts?: Record<string, unknown>) => Ajv;

/** Type guard that validates a value is an Ajv-compatible constructor. */
function isAjvCtor(val: unknown): val is AjvCtorLike {
  return typeof val === 'function';
}

/**
 * Creates an Ajv instance from a module import, handling ESM/CJS interop
 * where the module may be double-wrapped as { default: Constructor }.
 */
function createAjvFromModule(mod: unknown, opts: Record<string, unknown>): Ajv {
  if (typeof mod === 'object' && mod !== null && 'default' in mod && isAjvCtor(mod.default)) {
    return new mod.default(opts);
  }
  if (isAjvCtor(mod)) {
    return new mod(opts);
  }
  throw new Error('Failed to resolve Ajv constructor from module');
}

/** Function type compatible with the ajv-formats plugin. */
type FormatsPluginFn = (ajv: Ajv, ...args: unknown[]) => unknown;

/** Type guard that validates a value is a formats plugin function. */
function isFormatsPlugin(val: unknown): val is FormatsPluginFn {
  return typeof val === 'function';
}

/**
 * Resolves the ajv-formats plugin function from a potentially wrapped module.
 */
function resolveFormatsPlugin(mod: unknown): FormatsPluginFn {
  if (typeof mod === 'object' && mod !== null && 'default' in mod && isFormatsPlugin(mod.default)) {
    return mod.default;
  }
  if (isFormatsPlugin(mod)) {
    return mod;
  }
  throw new Error('Failed to resolve ajv-formats plugin from module');
}

const ajvOptions = {
  // See: https://ajv.js.org/options.html#strict-mode-options
  // strictSchema defaults to true and prevents use of JSON schemas that
  // include unrecognized keywords. The JSON schema spec specifically allows
  // for the use of non-standard keywords and the spec-compliant behavior
  // is to ignore those keywords. Note that setting this to false also
  // allows use of non-standard or custom formats (the unknown format value
  // will be logged but the schema will still be considered valid).
  strictSchema: false,
};

// Draft-07 validator (default)
const ajvDefault: Ajv = createAjvFromModule(AjvPkg, ajvOptions);

// Draft-2020-12 validator for MCP servers using rmcp
const ajv2020: Ajv = createAjvFromModule(Ajv2020Pkg, ajvOptions);

const addFormatsFunc = resolveFormatsPlugin(addFormatsPkg);
addFormatsFunc(ajvDefault);
addFormatsFunc(ajv2020);

// Canonical draft-2020-12 meta-schema URI (used by rmcp MCP servers)
const DRAFT_2020_12_SCHEMA = 'https://json-schema.org/draft/2020-12/schema';

/** Safely extracts the $schema URI from a schema object for logging. */
function getSchemaUri(schema: unknown): string {
  if (typeof schema === 'object' && schema !== null && '$schema' in schema) {
    return String(schema.$schema);
  }
  return '<no $schema>';
}

/**
 * Returns the appropriate validator based on schema's $schema field.
 */
function getValidator(schema: AnySchema): Ajv {
  if (
    typeof schema === 'object' &&
    schema !== null &&
    '$schema' in schema &&
    schema.$schema === DRAFT_2020_12_SCHEMA
  ) {
    return ajv2020;
  }
  return ajvDefault;
}

/**
 * Simple utility to validate objects against JSON Schemas.
 * Supports both draft-07 (default) and draft-2020-12 schemas.
 */
export class SchemaValidator {
  /**
   * Returns null if the data conforms to the schema described by schema (or if schema
   *  is null). Otherwise, returns a string describing the error.
   */
  static validate(schema: unknown | undefined, data: unknown): string | null {
    if (!schema) {
      return null;
    }
    if (typeof data !== 'object' || data === null) {
      return 'Value of params must be an object';
    }

    const anySchema = schema as AnySchema;
    const validator = getValidator(anySchema);

    // Try to compile and validate; skip validation if schema can't be compiled.
    // This handles schemas using JSON Schema versions AJV doesn't support
    // (e.g., draft-2019-09, future versions).
    // This matches LenientJsonSchemaValidator behavior in mcp-client.ts.
    let validate;
    try {
      validate = validator.compile(anySchema);
    } catch (error) {
      // Schema compilation failed (unsupported version, invalid $ref, etc.)
      // Skip validation rather than blocking tool usage.
      // This matches LenientJsonSchemaValidator behavior in mcp-client.ts.
      debugLogger.warn(
        `Failed to compile schema (${
          getSchemaUri(schema)
        }): ${error instanceof Error ? error.message : String(error)}. ` +
          'Skipping parameter validation.',
      );
      return null;
    }

    const valid = validate(data);
    if (!valid && validate.errors) {
      return validator.errorsText(validate.errors, { dataVar: 'params' });
    }
    return null;
  }

  /**
   * Validates a JSON schema itself. Returns null if the schema is valid,
   * otherwise returns a string describing the validation errors.
   */
  static validateSchema(schema: AnySchema | undefined): string | null {
    if (!schema) {
      return null;
    }
    const validator = getValidator(schema);
    try {
      const isValid = validator.validateSchema(schema);
      return isValid ? null : validator.errorsText(validator.errors);
    } catch (error) {
      // Schema validation failed (unsupported version, etc.)
      // Skip validation rather than blocking tool usage.
      debugLogger.warn(
        `Failed to validate schema (${
          getSchemaUri(schema)
        }): ${error instanceof Error ? error.message : String(error)}. ` +
          'Skipping schema validation.',
      );
      return null;
    }
  }
}
