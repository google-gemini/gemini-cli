/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import AjvPkg, { type AnySchema, type Ajv } from 'ajv';
// Ajv2020 is the documented way to use draft-2020-12: https://ajv.js.org/json-schema.html#draft-2020-12
// eslint-disable-next-line import/no-internal-modules
import Ajv2020Pkg from 'ajv/dist/2020.js';
import * as addFormats from 'ajv-formats';
import { debugLogger } from './debugLogger.js';

// Ajv's ESM/CJS interop: use 'any' for compatibility as recommended by Ajv docs
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-assignment
const AjvClass = (AjvPkg as any).default || AjvPkg;
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-assignment
const Ajv2020Class = (Ajv2020Pkg as any).default || Ajv2020Pkg;

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
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const ajvDefault: Ajv = new AjvClass(ajvOptions);

// Draft-2020-12 validator for MCP servers using rmcp
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const ajv2020: Ajv = new Ajv2020Class(ajvOptions);

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-assignment
const addFormatsFunc = (addFormats as any).default || addFormats;
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
        `Failed to compile schema (${
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          (schema as Record<string, unknown>)?.['$schema'] ?? '<no $schema>'
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          (schema as Record<string, unknown>)?.['$schema'] ?? '<no $schema>'
        }): ${error instanceof Error ? error.message : String(error)}. ` +
          'Skipping schema validation.',
      );
      return null;
    }
  }
}
