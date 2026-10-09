/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { safeJsonStringify } from './safeJsonStringify.js';

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

  it('should preserve shared (non-circular) references instead of emitting [Circular]', () => {
    // Regression test for #29406: OpenTelemetry metrics share the same
    // `endTime` object reference across records; a global "seen" set wrongly
    // replaced the second occurrence with [Circular].
    const sharedEndTime = { seconds: 1758900000, nanos: 0 };
    const telemetry = {
      resourceName: 'resource1',
      scopeMetrics: [
        {
          scope: { name: 'scopeA' },
          metrics: [
            { name: 'metricA', endTime: sharedEndTime },
            { name: 'metricB', endTime: sharedEndTime },
          ],
        },
      ],
    };

    const result = safeJsonStringify(telemetry);
    expect(result).toContain('"name":"metricA"');
    expect(result).toContain('"name":"metricB"');
    expect(result).toContain('"seconds":1758900000');
    // Both occurrences of the shared endTime must be serialized, not [Circular].
    expect(result.match(/1758900000/g)).toHaveLength(2);
    expect(result).not.toContain('[Circular]');
  });

  it('should preserve shared histogram bound arrays (explicit bucket boundaries)', () => {
    // Regression test for #29406: explicit histogram bounds share one array
    // reference between lower and upper bounds.
    const bounds = [0, 5, 10, 25, 50, 75, 100];
    const histogram = {
      dataPoints: [{ lowerBounds: bounds, upperBounds: bounds, count: 42 }],
    };

    const result = safeJsonStringify(histogram);
    expect(
      result.match(/"0,5,10,25,50,75,100"|0,5,10,25,50,75,100/g),
    ).toHaveLength(2);
    expect(result).not.toContain('[Circular]');
  });

  it('should still detect true circularity when a shared object is also its own descendant', () => {
    const shared = { marker: 'shared' };
    const root: Record<string, unknown> = { a: shared, b: shared };
    shared.self = root; // now genuinely circular through the shared object

    const result = safeJsonStringify(root);
    expect(result).toContain('[Circular]');
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
