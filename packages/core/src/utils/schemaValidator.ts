/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schema } from '@google/genai';
import AjvPkg from 'ajv';
// Ajv's ESM/CJS interop: use 'any' for compatibility as recommended by Ajv docs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AjvClass = (AjvPkg as any).default || AjvPkg;
const ajValidator = new AjvClass();

/**
 * Simple utility to validate objects against JSON Schemas
 */
export class SchemaValidator {
  /**
   * Returns null if the data confroms to the schema described by schema (or if schema
   *  is null). Otherwise, returns a string describing the error.
   */
  static validate(schema: Schema | undefined, data: unknown): string | null {
    if (!schema) {
      return null;
    }
    if (typeof data !== 'object' || data === null) {
      return 'Value of params must be an object';
    }
    const validate = ajValidator.compile(this.toObjectSchema(schema));
    const valid = validate(data);
    if (!valid && validate.errors) {
      return ajValidator.errorsText(validate.errors, { dataVar: 'params' });
    }
    return null;
  }

  /**
   * Converts @google/genai's Schema to an object compatible with avj.
   * This is necessary because it represents Types as an Enum (with
   * UPPERCASE values) and minItems and minLength as strings, when they should be numbers.
   */
  private static toObjectSchema(schema: Schema): object {
    const newSchema: Record<string, unknown> = { ...schema };
    if (newSchema.anyOf && Array.isArray(newSchema.anyOf)) {
      newSchema.anyOf = newSchema.anyOf.map((v) => this.toObjectSchema(v));
    }
    if (newSchema.items) {
      newSchema.items = this.toObjectSchema(newSchema.items);
    }
    if (newSchema.properties && typeof newSchema.properties === 'object') {
      const newProperties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(newSchema.properties)) {
        newProperties[key] = this.toObjectSchema(value as Schema);
      }
      newSchema.properties = newProperties;
    }
    if (newSchema.type) {
      newSchema.type = String(newSchema.type).toLowerCase();
    }
    if (newSchema.minItems) {
      newSchema.minItems = Number(newSchema.minItems);
    }
    if (newSchema.minLength) {
      newSchema.minLength = Number(newSchema.minLength);
    }
    return newSchema;
  }
}
