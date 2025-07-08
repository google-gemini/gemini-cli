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
   * @param schema JSON Schema to validate against (can be undefined)
   * @param data Data to validate
   * @returns null if valid, error message string if invalid
   */
  static validate(schema: any, data: unknown): string | null {
    if (!schema) {
      return null;
    }

    // Convert schema to Record<string, unknown> if needed
    const schemaObj = typeof schema === 'object' && schema !== null ? schema : {};

    // This is a simplified implementation
    // In a real application, you would use a library like Ajv for proper validation

    // Check for required fields
    if (schemaObj.required && Array.isArray(schemaObj.required)) {
      const required = schemaObj.required as string[];
      const dataObj = data as Record<string, unknown>;

      for (const field of required) {
        if (dataObj[field] === undefined) {
          return `Missing required field: ${field}`;
        }
      }
    }

    // Check property types if properties are defined
    if (schemaObj.properties && typeof schemaObj.properties === 'object') {
      const properties = schemaObj.properties as Record<string, { type?: string }>;
      const dataObj = data as Record<string, unknown>;

      for (const [key, prop] of Object.entries(properties)) {
        if (dataObj[key] !== undefined && prop.type) {
          const expectedType = prop.type;
          const actualType = Array.isArray(dataObj[key])
            ? 'array'
            : typeof dataObj[key];

          if (expectedType !== actualType) {
            return `Type mismatch for property "${key}": expected ${expectedType}, got ${actualType}`;
          }
        }
      }
    }

    return null;
  }
}
