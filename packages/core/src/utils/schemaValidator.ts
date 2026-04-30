/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import AjvPkg, { type AnySchema, type Ajv } from 'ajv';
// Ajv2020 is the documented way to use draft-2020-12: https://ajv.js.org/json-schema.html#draft-2020-12

import Ajv2020Pkg from 'ajv/dist/2020.js';
import * as addFormats from 'ajv-formats';
import { debugLogger } from './debugLogger.js';

/**
 * Type guard: checks whether the given value is a constructor function
 * compatible with Ajv's constructor signature.
 */
function isAjvConstructor(
  val: unknown,
): val is new (opts: Record<string, unknown>) => Ajv {
  return typeof val === 'function';
}

/**
 * Resolves an Ajv constructor from a module that may export it as a default
 * property (CJS interop) or directly (ESM).
 */
function resolveAjvConstructor(
  mod: typeof AjvPkg | typeof Ajv2020Pkg,
): new (opts: Record<string, unknown>) => Ajv {
  if (isAjvConstructor(mod)) {
    return mod;
  }
  if (
    typeof mod === 'object' &&
    mod !== null &&
    'default' in mod &&
    isAjvConstructor(mod.default)
  ) {
    return mod.default;
  }
  throw new Error('Unable to resolve Ajv constructor from module');
}

/**
 * Type guard: checks whether the given value is a function that accepts
 * an Ajv instance (the ajv-formats plugin signature).
 */
function isFormatsPlugin(val: unknown): val is (ajv: Ajv) => void {
  return typeof val === 'function';
}

/**
 * Resolves the addFormats plugin function from a module that may export it
 * as a default property (CJS interop) or directly (ESM).
 */
function resolveFormatsPlugin(mod: unknown): (ajv: Ajv) => void {
  if (isFormatsPlugin(mod)) {
    return mod;
  }
  if (
    typeof mod === 'object' &&
    mod !== null &&
    'default' in mod &&
    isFormatsPlugin(mod.default)
  ) {
    return mod.default;
  }
  throw new Error('Unable to resolve ajv-formats plugin from module');
}

/**
 * Type guard for objects that have a string-valued `$schema` property.
 */
interface SchemaWithUri {
  $schema: string;
}

function hasSchemaUri(val: unknown): val is SchemaWithUri {
  if (typeof val !== 'object' || val === null || !('$schema' in val)) {
    return false;
  }
  // After `in` narrowing, TypeScript knows val has $schema
  return typeof val.$schema === 'string';
}

/**
 * Extracts the $schema URI from a schema object using a type guard,
 * avoiding inline unsafe type assertions.
 */
function getSchemaUri(schema: unknown): string {
  return hasSchemaUri(schema) ? schema.$schema : '<no $schema>';
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

// Ajv's ESM/CJS interop: resolved via type-guarded helper functions
const AjvClass = resolveAjvConstructor(AjvPkg);
const Ajv2020Class = resolveAjvConstructor(Ajv2020Pkg);

// Draft-07 validator (default)
const ajvDefault: Ajv = new AjvClass(ajvOptions);

// Draft-2020-12 validator for MCP servers using rmcp
const ajv2020: Ajv = new Ajv2020Class(ajvOptions);

const addFormatsFunc = resolveFormatsPlugin(addFormats);
addFormatsFunc(ajvDefault);
addFormatsFunc(ajv2020);

// Canonical draft-2020-12 meta-schema URI (used by rmcp MCP servers)
const DRAFT_2020_12_SCHEMA = 'https://json-schema.org/draft/2020-12/schema';

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
        `Failed to compile schema (${getSchemaUri(schema)}): ${error instanceof Error ? error.message : String(error)}. ` +
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
        `Failed to validate schema (${getSchemaUri(schema)}): ${error instanceof Error ? error.message : String(error)}. ` +
          'Skipping schema validation.',
      );
      return null;
    }
  }
}
