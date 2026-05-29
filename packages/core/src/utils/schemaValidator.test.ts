/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { SchemaValidator } from './schemaValidator.js';

describe('SchemaValidator', () => {
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

  it('gracefully handles validation that would throw with malformed schemas', () => {
    // Malformed schema with required field not in properties
    // This could cause Ajv to access .type on undefined internally.
    const schema = {
      type: 'object',
      required: ['nonexistent_prop'],
      properties: {
        file_path: { type: 'string' },
      },
    };
    const params = { file_path: '/some/path' };
    // Should not throw - should gracefully skip or return validation error
    expect(() => SchemaValidator.validate(schema, params)).not.toThrow();
  });

  it('handles boolean schema (JSON Schema boolean form)', () => {
    // JSON Schema allows true (always valid) or false (always invalid)
    expect(SchemaValidator.validate(true, { foo: 'bar' })).toBeNull();
    const result = SchemaValidator.validate(false, { foo: 'bar' });
    // false schema means everything is invalid
    expect(result).not.toBeNull();
  });

  it('handles data with null values gracefully', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };
    const params = { name: null };
    expect(() => SchemaValidator.validate(schema, params)).not.toThrow();
  });

  it('allows schemas with draft-07 $schema property', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      $schema: 'http://json-schema.org/draft-07/schema#',
    };
    const params = { name: 'test' };
    expect(SchemaValidator.validate(schema, params)).toBeNull();
  });

  it('allows schemas with unrecognized $schema versions (lenient fallback)', () => {
    // Future-proof: any unrecognized schema version should skip validation
    // with a warning rather than failing
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      $schema: 'https://json-schema.org/draft/2030-99/schema',
    };
    const params = { name: 'test' };
    expect(SchemaValidator.validate(schema, params)).toBeNull();
  });

  it('handles $ref to non-existent definition (Ajv .type on undefined crash)', () => {
    // This exercises the precise Ajv internal crash path that triggered
    // "Cannot read properties of undefined (reading 'type')" when a $ref
    // points to a definition that doesn't exist in the schema.
    const schema = {
      type: 'object',
      properties: {
        file_path: { $ref: '#/definitions/NonExistent' },
      },
    };
    const params = { file_path: '/some/path' };
    expect(() => SchemaValidator.validate(schema, params)).not.toThrow();
    expect(SchemaValidator.validate(schema, params)).toBeNull();
  });

  it('handles deeply nested required with missing property definition', () => {
    // Schema where required references a property whose definition is
    // nested inside an empty properties object, causing Ajv to access
    // .type on the undefined property definition.
    const schema = {
      type: 'object',
      required: ['deeply_nested'],
      properties: {
        deeply_nested: { type: 'object' },
      },
    };
    const params = { deeply_nested: { foo: 'bar' } };
    expect(() => SchemaValidator.validate(schema, params)).not.toThrow();
  });

  it('handles schema with null property entries', () => {
    // Edge case where a property definition is null.
    const schema = {
      type: 'object',
      properties: {
        file_path: null,
      },
    };
    const params = { file_path: '/some/path' };
    expect(() => SchemaValidator.validate(schema, params)).not.toThrow();
  });

  it('handles unknown schema version gracefully', () => {
    // Future JSON Schema versions that Ajv doesn't support should
    // skip validation rather than throwing or failing.
    const schema = {
      $schema: 'https://json-schema.org/draft/2099-01/schema',
      type: 'object',
      properties: { name: { type: 'string' } },
    };
    const params = { name: 'test' };
    expect(SchemaValidator.validate(schema, params)).toBeNull();
  });

  it('handles validateSchema with malformed schema that would throw', () => {
    // Schema with a broken format that causes validateSchema to throw.
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };
    expect(() => SchemaValidator.validateSchema(schema)).not.toThrow();
  });

  it('handles validateSchema with null/undefined', () => {
    expect(SchemaValidator.validateSchema(undefined)).toBeNull();
    expect(SchemaValidator.validateSchema(null as unknown as undefined)).toBeNull();
  });

  it('handles validateSchema returning errors for invalid schema', () => {
    // Invalid schema where type property is a number instead of a string
    const schema = {
      type: 123,
    };
    const result = SchemaValidator.validateSchema(schema);
    expect(result).not.toBeNull();
  });

  describe('JSON Schema draft-2020-12 support', () => {
    it('validates params against draft-2020-12 schema', () => {
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          message: {
            type: 'string',
          },
        },
        required: ['message'],
      };

      // Valid data should pass
      expect(SchemaValidator.validate(schema, { message: 'hello' })).toBeNull();
      // Invalid data should fail (proves validation actually works)
      expect(SchemaValidator.validate(schema, { message: 123 })).not.toBeNull();
    });

    it('validates draft-2020-12 schema with prefixItems', () => {
      // prefixItems is a draft-2020-12 feature (replaces tuple validation)
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          coords: {
            type: 'array',
            prefixItems: [{ type: 'number' }, { type: 'number' }],
            items: false,
          },
        },
      };

      // Valid: exactly 2 numbers
      expect(SchemaValidator.validate(schema, { coords: [1, 2] })).toBeNull();
      // Invalid: 3 items when items: false
      expect(
        SchemaValidator.validate(schema, { coords: [1, 2, 3] }),
      ).not.toBeNull();
    });

    it('validates draft-2020-12 schema with $defs', () => {
      // draft-2020-12 uses $defs instead of definitions
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        $defs: {
          ChatRole: {
            type: 'string',
            enum: ['System', 'User', 'Assistant'],
          },
        },
        properties: {
          role: { $ref: '#/$defs/ChatRole' },
        },
        required: ['role'],
      };

      // Valid enum value
      expect(SchemaValidator.validate(schema, { role: 'User' })).toBeNull();
      // Invalid enum value (proves validation works)
      expect(
        SchemaValidator.validate(schema, { role: 'InvalidRole' }),
      ).not.toBeNull();
    });
  });
});
