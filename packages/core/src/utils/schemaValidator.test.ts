/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { SchemaValidator } from './schemaValidator.js';

describe('SchemaValidator', () => {
  describe('validateSchema', () => {
    it('should return null for valid primitive type schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };
      expect(SchemaValidator.validateSchema(schema)).toBeNull();
    });

    it('should return null for schema with enum', () => {
      const schema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'pending'],
          },
        },
      };
      expect(SchemaValidator.validateSchema(schema)).toBeNull();
    });

    it('should return null for schema with oneOf', () => {
      const schema = {
        type: 'object',
        properties: {
          value: {
            oneOf: [{ type: 'string' }, { type: 'number' }],
          },
        },
      };
      expect(SchemaValidator.validateSchema(schema)).toBeNull();
    });

    it('should return null for schema with nested objects', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      };
      expect(SchemaValidator.validateSchema(schema)).toBeNull();
    });

    it('should return null for schema with arrays', () => {
      const schema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };
      expect(SchemaValidator.validateSchema(schema)).toBeNull();
    });

    it('should return null for null/undefined schema', () => {
      expect(SchemaValidator.validateSchema(null)).toBeNull();
      expect(SchemaValidator.validateSchema(undefined)).toBeNull();
    });

    it('should return null for empty object schema', () => {
      const schema = {
        type: 'object',
        properties: {},
      };
      expect(SchemaValidator.validateSchema(schema)).toBeNull();
    });

    it('should return null for schema with required fields', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };
      expect(SchemaValidator.validateSchema(schema)).toBeNull();
    });

    it('should return error for invalid schema with wrong type value', () => {
      const schema = {
        type: 'invalid-type',
      };
      const error = SchemaValidator.validateSchema(schema);
      expect(error).not.toBeNull();
      expect(error).toContain('type');
    });

    it('should return error for schema with invalid enum (not an array)', () => {
      const schema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: 'not-an-array',
          },
        },
      };
      const error = SchemaValidator.validateSchema(schema);
      expect(error).not.toBeNull();
    });

    it('should return null for deeply nested schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: { type: 'string' },
                },
              },
            },
          },
        },
      };
      expect(SchemaValidator.validateSchema(schema)).toBeNull();
    });
  });

  describe('validate', () => {
    it('should allow any params if schema is undefined', () => {
      const params = {
        foo: 'bar',
      };
      expect(SchemaValidator.validate(undefined, params)).toBeNull();
    });

    it('rejects null params', () => {
      const schema = {
        type: 'object',
        properties: {
          foo: {
            type: 'string',
          },
        },
      };
      expect(SchemaValidator.validate(schema, null)).toBe(
        'Value of params must be an object',
      );
    });

    it('rejects params that are not objects', () => {
      const schema = {
        type: 'object',
        properties: {
          foo: {
            type: 'string',
          },
        },
      };
      expect(SchemaValidator.validate(schema, 'not an object')).toBe(
        'Value of params must be an object',
      );
    });

    it('allows schema with extra properties', () => {
      const schema = {
        type: 'object',
        properties: {
          example_enum: {
            type: 'string',
            enum: ['FOO', 'BAR'],
            // enum-descriptions is not part of the JSON schema spec.
            // This test verifies that the SchemaValidator allows the
            // use of extra keywords, like this one, in the schema.
            'enum-descriptions': ['a foo', 'a bar'],
          },
        },
      };
      const params = {
        example_enum: 'BAR',
      };

      expect(SchemaValidator.validate(schema, params)).toBeNull();
    });

    it('allows custom format values', () => {
      const schema = {
        type: 'object',
        properties: {
          duration: {
            type: 'string',
            // See: https://cloud.google.com/docs/discovery/type-format
            format: 'google-duration',
          },
          mask: {
            type: 'string',
            format: 'google-fieldmask',
          },
          foo: {
            type: 'string',
            format: 'something-totally-custom',
          },
        },
      };
      const params = {
        duration: '10s',
        mask: 'foo.bar,biz.baz',
        foo: 'some value',
      };
      expect(SchemaValidator.validate(schema, params)).toBeNull();
    });

    it('allows valid values for known formats', () => {
      const schema = {
        type: 'object',
        properties: {
          today: {
            type: 'string',
            format: 'date',
          },
        },
      };
      const params = {
        today: '2025-04-08',
      };
      expect(SchemaValidator.validate(schema, params)).toBeNull();
    });

    it('rejects invalid values for known formats', () => {
      const schema = {
        type: 'object',
        properties: {
          today: {
            type: 'string',
            format: 'date',
          },
        },
      };
      const params = {
        today: 'this is not a date',
      };
      expect(SchemaValidator.validate(schema, params)).not.toBeNull();
    });
  });
});
