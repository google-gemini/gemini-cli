/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const Ajv = require('ajv');

/**
 * Simple utility to validate objects against JSON Schemas
 */
export class SchemaValidator {
  private static ajv = new Ajv({ allErrors: true });

  /**
   * Validates data against a JSON schema
   * @param schema JSON Schema to validate against (can be undefined)
   * @param data Data to validate
   * @returns null if valid, error message string if invalid
   */
  static validate(schema: any, data: unknown): string | null {
    if (!schema) {
      return null;
    }

    try {
      const validate = this.ajv.compile(schema);
      const valid = validate(data);
      
      if (!valid && validate.errors) {
        // Format errors to match expected test format
        const error = validate.errors[0];
        if (error.keyword === 'required') {
          return `params must have required property '${error.params?.missingProperty}'`;
        } else if (error.keyword === 'pattern') {
          return `params${error.instancePath} must match pattern "${error.params?.pattern}"`;
        } else if (error.keyword === 'minItems') {
          return `params${error.instancePath} must NOT have fewer than ${error.params?.limit} items`;
        } else if (error.keyword === 'minLength') {
          return `params${error.instancePath} must NOT have fewer than ${error.params?.limit} characters`;
        } else if (error.keyword === 'type') {
          return `params${error.instancePath} must be ${error.params?.type}`;
        }
        
        // Fallback to general error message
        return `params${error.instancePath} ${error.message}`;
      }
      
      return null;
    } catch (error) {
      // Handle schema compilation errors
      return `Invalid schema: ${error}`;
    }
  }
}
