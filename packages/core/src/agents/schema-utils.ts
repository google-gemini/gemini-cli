/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InputConfig } from './types.js';

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
 * Converts an internal `InputConfig` definition into a standard JSON Schema
 * object suitable for a tool's `FunctionDeclaration`.
 *
 * This utility ensures that the configuration for a subagent's inputs is
 * correctly translated into the format expected by the generative model.
 *
 * @param inputConfig The internal `InputConfig` to convert.
 * @returns A JSON Schema object representing the inputs.
 * @throws An `Error` if an unsupported input type is encountered, ensuring
 * configuration errors are caught early.
 */
export function convertInputConfigToJsonSchema(
  inputConfig: InputConfig,
): JsonSchemaObject {
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
