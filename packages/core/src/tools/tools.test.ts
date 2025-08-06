/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { hasCycleInSchema } from './tools.js'; // Added getStringifiedResultForDisplay

describe('hasCycleInSchema', () => {
  it('should detect a simple direct cycle', () => {
    const schema = {
      properties: {
        data: {
          $ref: '#/properties/data',
        },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(true);
  });

  it('should detect a cycle from object properties referencing parent properties', () => {
    const schema = {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            child: { $ref: '#/properties/data' },
          },
        },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(true);
  });

  it('should detect a cycle from array items referencing parent properties', () => {
    const schema = {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              child: { $ref: '#/properties/data/items' },
            },
          },
        },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(true);
  });

  it('should detect a cycle between sibling properties', () => {
    const schema = {
      type: 'object',
      properties: {
        a: {
          type: 'object',
          properties: {
            child: { $ref: '#/properties/b' },
          },
        },
        b: {
          type: 'object',
          properties: {
            child: { $ref: '#/properties/a' },
          },
        },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(true);
  });

  it('should not detect a cycle in a valid schema', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        address: { $ref: '#/definitions/address' },
      },
      definitions: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
          },
        },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(false);
  });

  it('should handle non-cyclic sibling refs', () => {
    const schema = {
      properties: {
        a: { $ref: '#/definitions/stringDef' },
        b: { $ref: '#/definitions/stringDef' },
      },
      definitions: {
        stringDef: { type: 'string' },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(false);
  });

  it('should handle nested but not cyclic refs', () => {
    const schema = {
      properties: {
        a: { $ref: '#/definitions/defA' },
      },
      definitions: {
        defA: { properties: { b: { $ref: '#/definitions/defB' } } },
        defB: { type: 'string' },
      },
    };
    expect(hasCycleInSchema(schema)).toBe(false);
  });

  it('should return false for an empty schema', () => {
    expect(hasCycleInSchema({})).toBe(false);
  });
});
