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

  it('allows schemas with draft-2020-12 $schema property', () => {
    // Schema compilation may fail for 2020-12, but validation should pass
    // (skip validation) rather than throwing an error
    const schema = {
      type: 'object',
      properties: {
        message: {
          description: 'hello world',
          type: 'string',
        },
      },
      required: ['message'],
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'GetMsgRequest',
    };
    const params = { message: 'greetings from earth' };
    expect(SchemaValidator.validate(schema, params)).toBeNull();
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

  it('allows schemas with unrecognized $schema versions', () => {
    // Future-proof: any unrecognized schema version should skip validation
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      $schema: 'https://json-schema.org/draft/2030-99/schema',
    };
    const params = { name: 'test' };
    expect(SchemaValidator.validate(schema, params)).toBeNull();
  });

  it('allows schemas with $defs (may skip validation)', () => {
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
    const params = { role: 'User' };
    expect(SchemaValidator.validate(schema, params)).toBeNull();
  });
});
