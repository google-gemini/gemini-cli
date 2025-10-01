/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { convertInputConfigToJsonSchema } from './schema-utils.js';
import type { InputConfig } from './types.js';

const PRIMITIVE_TYPES_CONFIG: InputConfig = {
  inputs: {
    goal: {
      type: 'string',
      description: 'The primary objective',
      required: true,
    },
    max_retries: {
      type: 'integer',
      description: 'Maximum number of retries',
      required: false,
    },
    temperature: {
      type: 'number',
      description: 'The model temperature',
      required: true,
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose logging',
      required: false,
    },
  },
};

const ARRAY_TYPES_CONFIG: InputConfig = {
  inputs: {
    filenames: {
      type: 'string[]',
      description: 'A list of file paths',
      required: true,
    },
    scores: {
      type: 'number[]',
      description: 'A list of scores',
      required: false,
    },
  },
};

const NO_REQUIRED_FIELDS_CONFIG: InputConfig = {
  inputs: {
    optional_param: {
      type: 'string',
      description: 'An optional parameter',
      required: false,
    },
  },
};

const ALL_REQUIRED_FIELDS_CONFIG: InputConfig = {
  inputs: {
    paramA: { type: 'string', description: 'Parameter A', required: true },
    paramB: { type: 'boolean', description: 'Parameter B', required: true },
  },
};

const EMPTY_CONFIG: InputConfig = {
  inputs: {},
};

const UNSUPPORTED_TYPE_CONFIG: InputConfig = {
  inputs: {
    invalid_param: {
      // @ts-expect-error - Intentionally testing an invalid type
      type: 'date',
      description: 'This type is not supported',
      required: true,
    },
  },
};

describe('convertInputConfigToJsonSchema', () => {
  describe('type conversion', () => {
    it('should correctly convert an InputConfig with various primitive types', () => {
      const result = convertInputConfigToJsonSchema(PRIMITIVE_TYPES_CONFIG);

      expect(result).toEqual({
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'The primary objective' },
          max_retries: {
            type: 'integer',
            description: 'Maximum number of retries',
          },
          temperature: { type: 'number', description: 'The model temperature' },
          verbose: { type: 'boolean', description: 'Enable verbose logging' },
        },
        required: ['goal', 'temperature'],
      });
    });

    it('should correctly handle array types for strings and numbers', () => {
      const result = convertInputConfigToJsonSchema(ARRAY_TYPES_CONFIG);

      expect(result).toEqual({
        type: 'object',
        properties: {
          filenames: {
            type: 'array',
            description: 'A list of file paths',
            items: { type: 'string' },
          },
          scores: {
            type: 'array',
            description: 'A list of scores',
            items: { type: 'number' },
          },
        },
        required: ['filenames'],
      });
    });
  });

  describe('required field handling', () => {
    it('should produce an undefined `required` field when no inputs are required', () => {
      const result = convertInputConfigToJsonSchema(NO_REQUIRED_FIELDS_CONFIG);

      expect(result.properties['optional_param']).toBeDefined();
      // Per the implementation and JSON Schema spec, the `required` field
      // should be omitted if no properties are required.
      expect(result.required).toBeUndefined();
    });

    it('should list all properties in `required` when all are marked as required', () => {
      const result = convertInputConfigToJsonSchema(ALL_REQUIRED_FIELDS_CONFIG);
      expect(result.required).toHaveLength(2);
      expect(result.required).toEqual(
        expect.arrayContaining(['paramA', 'paramB']),
      );
    });
  });

  describe('edge cases', () => {
    it('should return a valid, empty schema for an empty input config', () => {
      const result = convertInputConfigToJsonSchema(EMPTY_CONFIG);

      expect(result).toEqual({
        type: 'object',
        properties: {},
        required: undefined,
      });
    });
  });

  describe('error handling', () => {
    it('should throw an informative error for an unsupported input type', () => {
      const action = () =>
        convertInputConfigToJsonSchema(UNSUPPORTED_TYPE_CONFIG);

      expect(action).toThrow(/Unsupported input type 'date'/);
      expect(action).toThrow(/parameter 'invalid_param'/);
    });
  });
});
