/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { profileToPerfetto } from './cpu-profile.js';

describe('profileToPerfetto', () => {
  it('serializes CPU samples as complete events on the CPU track', () => {
    const trace = profileToPerfetto({
      startTime: 1_000,
      endTime: 1_350,
      timeDeltas: [100, 250],
      samples: [2, 2],
      nodes: [
        {
          id: 1,
          callFrame: {
            functionName: '(root)',
            scriptId: '0',
            url: '',
            lineNumber: 0,
            columnNumber: 0,
          },
          children: [2],
        },
        {
          id: 2,
          callFrame: {
            functionName: 'hotFunction',
            scriptId: '1',
            url: 'file:///app.js',
            lineNumber: 9,
            columnNumber: 4,
          },
        },
      ],
    });

    const parsed = JSON.parse(trace) as {
      traceEvents: Array<Record<string, unknown>>;
    };
    const sampleEvents = parsed.traceEvents.filter(
      (event) => event['name'] === 'hotFunction',
    );

    expect(sampleEvents).toHaveLength(2);
    expect(sampleEvents).toEqual([
      expect.objectContaining({
        ph: 'X',
        ts: 1_000,
        dur: 100,
        args: expect.objectContaining({
          sampleIndex: 0,
          nodeId: 2,
          url: 'file:///app.js',
        }),
      }),
      expect.objectContaining({
        ph: 'X',
        ts: 1_100,
        dur: 250,
        args: expect.objectContaining({
          sampleIndex: 1,
          nodeId: 2,
          lineNumber: 9,
          columnNumber: 4,
        }),
      }),
    ]);

    expect(
      parsed.traceEvents.some((event) => event['name'] === 'memory_snapshot'),
    ).toBe(false);
  });
});
