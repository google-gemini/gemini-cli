/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simple utility to validate objects against JSON Schemas
 */
export class SchemaValidator {
  /**
   * Validates data against a JSON schema
   * @param schema JSON Schema to validate against
   * @param data Data to validate
   * @returns True if valid, false otherwise
   */
  static validate(schema: Record<string, unknown>, data: unknown): boolean {
    // This is a simplified implementation
    // In a real application, you would use a library like Ajv for proper validation

    // Check for required fields
    if (schema.required && Array.isArray(schema.required)) {
      const required = schema.required as string[];
      const dataObj = data as Record<string, unknown>;

      for (const field of required) {
        if (dataObj[field] === undefined) {
          console.error(`Missing required field: ${field}`);
          return false;
        }
      }
    }

    // Check property types if properties are defined
    if (schema.properties && typeof schema.properties === 'object') {
      const properties = schema.properties as Record<string, { type?: string }>;
      const dataObj = data as Record<string, unknown>;

      for (const [key, prop] of Object.entries(properties)) {
        if (dataObj[key] !== undefined && prop.type) {
          const expectedType = prop.type;
          const actualType = Array.isArray(dataObj[key])
            ? 'array'
            : typeof dataObj[key];

          if (expectedType !== actualType) {
            console.error(
              `Type mismatch for property "${key}": expected ${expectedType}, got ${actualType}`,
            );
            return false;
          }
        }
      }
    }

    return true;
  }
}
