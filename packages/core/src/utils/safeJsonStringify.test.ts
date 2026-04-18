/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  safeJsonStringify,
  safeJsonStringifyBooleanValuesOnly,
} from './safeJsonStringify.js';

describe('safeJsonStringify', () => {
  it('should stringify normal objects without issues', () => {
    const obj = { name: 'test', value: 42 };
    const result = safeJsonStringify(obj);
    expect(result).toBe('{"name":"test","value":42}');
  });

  it('should handle circular references by replacing them with [Circular]', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = { name: 'test' };
    obj.circular = obj; // Create circular reference

    const result = safeJsonStringify(obj);
    expect(result).toBe('{"name":"test","circular":"[Circular]"}');
  });

  it('should handle complex circular structures like HttpsProxyAgent', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agent: any = {
      sockets: {},
      options: { host: 'example.com' },
    };
    agent.sockets['example.com'] = [{ agent }];

    const result = safeJsonStringify(agent);
    expect(result).toContain('[Circular]');
    expect(result).toContain('example.com');
  });

  it('should respect the space parameter for formatting', () => {
    const obj = { name: 'test', value: 42 };
    const result = safeJsonStringify(obj, 2);
    expect(result).toBe('{\n  "name": "test",\n  "value": 42\n}');
  });

  it('should handle circular references with formatting', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = { name: 'test' };
    obj.circular = obj;

    const result = safeJsonStringify(obj, 2);
    expect(result).toBe('{\n  "name": "test",\n  "circular": "[Circular]"\n}');
  });

  it('should handle arrays with circular references', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] = [{ id: 1 }];
    arr[0].parent = arr; // Create circular reference

    const result = safeJsonStringify(arr);
    expect(result).toBe('[{"id":1,"parent":"[Circular]"}]');
  });

  it('should handle null and undefined values', () => {
    expect(safeJsonStringify(null)).toBe('null');
    expect(safeJsonStringify(undefined)).toBe(undefined);
  });

  it('should handle primitive values', () => {
    expect(safeJsonStringify('test')).toBe('"test"');
    expect(safeJsonStringify(42)).toBe('42');
    expect(safeJsonStringify(true)).toBe('true');
  });
});

describe('safeJsonStringifyBooleanValuesOnly', () => {
  it('should retain only boolean values', () => {
    const obj = { enabled: true, disabled: false, name: 'test', count: 42 };
    const result = JSON.parse(safeJsonStringifyBooleanValuesOnly(obj));
    expect(result).toEqual({ enabled: true, disabled: false });
  });

  it('should return empty object for non-object input', () => {
    const result = safeJsonStringifyBooleanValuesOnly(null);
    expect(result).toBe('{}');
  });

  it('should handle object with no boolean values', () => {
    const obj = { name: 'test', count: 42 };
    const result = JSON.parse(safeJsonStringifyBooleanValuesOnly(obj));
    expect(result).toEqual({});
  });

  it('should handle empty object', () => {
    const result = JSON.parse(safeJsonStringifyBooleanValuesOnly({}));
    expect(result).toEqual({});
  });
});
