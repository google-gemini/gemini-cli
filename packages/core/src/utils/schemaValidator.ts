/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Ajv from 'ajv';

interface GeminiSchema {
  type?: string;
  minLength?: string | number;
  maxLength?: string | number;
  minItems?: string | number;
  maxItems?: string | number;
  minimum?: string | number;
  maximum?: string | number;
  properties?: Record<string, GeminiSchema>;
  items?: GeminiSchema;
  additionalProperties?: GeminiSchema | boolean;
  [key: string]: unknown;
}

/**
 * Simple utility to validate objects against JSON Schemas
 */
export class SchemaValidator {
  private static ajv = new (Ajv as unknown as new (options: {
    allErrors: boolean;
  }) => Ajv.default)({ allErrors: true });

  /**
   * Converts Google Gemini Schema to standard JSON Schema format
   * @param schema The schema to convert
   * @returns Converted schema
   */
  private static convertGeminiSchema(
    schema: GeminiSchema | unknown,
  ): GeminiSchema {
    if (!schema || typeof schema !== 'object') {
      return schema as GeminiSchema;
    }

    const converted = { ...(schema as GeminiSchema) };

    // Convert Google Gemini type names to standard JSON Schema types
    if (converted.type) {
      switch (converted.type) {
        case 'STRING':
          converted.type = 'string';
          break;
        case 'ARRAY':
          converted.type = 'array';
          break;
        case 'OBJECT':
          converted.type = 'object';
          break;
        case 'BOOLEAN':
          converted.type = 'boolean';
          break;
        case 'NUMBER':
          converted.type = 'number';
          break;
        case 'INTEGER':
          converted.type = 'integer';
          break;
        default:
          // Keep other types as-is for standard JSON Schema compatibility
          break;
      }
    }

    // Convert string numbers to actual numbers for Ajv compatibility
    if (converted.minLength && typeof converted.minLength === 'string') {
      converted.minLength = parseInt(converted.minLength, 10);
    }
    if (converted.maxLength && typeof converted.maxLength === 'string') {
      converted.maxLength = parseInt(converted.maxLength, 10);
    }
    if (converted.minItems && typeof converted.minItems === 'string') {
      converted.minItems = parseInt(converted.minItems, 10);
    }
    if (converted.maxItems && typeof converted.maxItems === 'string') {
      converted.maxItems = parseInt(converted.maxItems, 10);
    }
    if (converted.minimum && typeof converted.minimum === 'string') {
      converted.minimum = parseFloat(converted.minimum);
    }
    if (converted.maximum && typeof converted.maximum === 'string') {
      converted.maximum = parseFloat(converted.maximum);
    }

    // Recursively convert nested objects
    if (converted.properties) {
      converted.properties = Object.keys(converted.properties).reduce(
        (acc, key) => {
          acc[key] = this.convertGeminiSchema(converted.properties![key]);
          return acc;
        },
        {} as Record<string, GeminiSchema>,
      );
    }

    if (converted.items) {
      converted.items = this.convertGeminiSchema(converted.items);
    }

    if (
      converted.additionalProperties &&
      typeof converted.additionalProperties === 'object'
    ) {
      converted.additionalProperties = this.convertGeminiSchema(
        converted.additionalProperties,
      );
    }

    return converted;
  }

  /**
   * Validates data against a JSON schema
   * @param schema JSON Schema to validate against (can be undefined)
   * @param data Data to validate
   * @returns null if valid, error message string if invalid
   */
  static validate(
    schema: GeminiSchema | unknown,
    data: unknown,
  ): string | null {
    if (!schema) {
      return null;
    }

    try {
      // Convert Google Gemini schema format to standard JSON Schema
      const convertedSchema = this.convertGeminiSchema(schema);

      const validate = this.ajv.compile(convertedSchema as Ajv.AnySchema);
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
