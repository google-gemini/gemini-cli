/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InputConfig, InputConfigNew } from './types.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Defines the structure for a JSON Schema object, used for tool function
 * declarations.
 */
interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/**
 * Defines the structure for a property within a {@link JsonSchemaObject}.
 */
interface JsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array';
  description: string;
  items?: { type: 'string' | 'number' };
}

/**
 * Type guard to check if InputConfig is using the new format.
 */
function isNewFormat(config: InputConfig): config is InputConfigNew {
  return 'inputSchema' in config;
}

/**
 * Converts an internal `InputConfig` definition into a standard JSON Schema
 * object suitable for a tool's `FunctionDeclaration`.
 *
 * This utility handles both the new JSONSchema7 format and the legacy format
 * for backward compatibility. For the new format, it validates the schema
 * and returns it directly. For the legacy format, it converts the custom
 * type descriptors to JSON Schema.
 *
 * @param inputConfig The internal `InputConfig` to convert.
 * @returns A JSON Schema object representing the inputs.
 * @throws An `Error` if the schema is invalid or an unsupported input type is
 * encountered.
 */
export function convertInputConfigToJsonSchema(
  inputConfig: InputConfig,
): JsonSchemaObject {
  // Handle new JSONSchema7 format
  if (isNewFormat(inputConfig)) {
    const schemaError = SchemaValidator.validateSchema(inputConfig.inputSchema);
    if (schemaError) {
      throw new Error(
        `Invalid JSON Schema in inputConfig.inputSchema: ${schemaError}`,
      );
    }

    // Ensure the schema is an object type
    if (
      inputConfig.inputSchema.type !== 'object' ||
      !inputConfig.inputSchema.properties
    ) {
      throw new Error(
        'inputConfig.inputSchema must have type "object" and define properties',
      );
    }

    // Cast to JsonSchemaObject - we've validated it's the right shape
    return inputConfig.inputSchema as JsonSchemaObject;
  }

  // Handle legacy format with deprecation warning
  debugLogger.warn(
    '[schema-utils] Using deprecated InputConfig.inputs format. ' +
      'Please migrate to InputConfig.inputSchema with JSONSchema7. ' +
      'The legacy format will be removed in a future version.',
  );

  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const [name, definition] of Object.entries(inputConfig.inputs)) {
    const schemaProperty: Partial<JsonSchemaProperty> = {
      description: definition.description,
    };

    switch (definition.type) {
      case 'string':
      case 'number':
      case 'integer':
      case 'boolean':
        schemaProperty.type = definition.type;
        break;

      case 'string[]':
        schemaProperty.type = 'array';
        schemaProperty.items = { type: 'string' };
        break;

      case 'number[]':
        schemaProperty.type = 'array';
        schemaProperty.items = { type: 'number' };
        break;

      default: {
        const exhaustiveCheck: never = definition.type;
        throw new Error(
          `Unsupported input type '${exhaustiveCheck}' for parameter '${name}'. ` +
            'Supported types: string, number, integer, boolean, string[], number[]',
        );
      }
    }

    properties[name] = schemaProperty as JsonSchemaProperty;

    if (definition.required) {
      required.push(name);
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  };
}
