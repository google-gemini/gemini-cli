/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiCliAgent } from './agent.js';
import { GeminiCliSession } from './session.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('GeminiCliSession', () => {
  it('propagates errors from dynamic instructions', async () => {
    vi.spyOn(GeminiCliSession.prototype, 'initialize').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async function (this: any) {
        this.client = { getHistory: () => [] };
        this.initialized = true;
      },
    );

    let callCount = 0;
    const agent = new GeminiCliAgent({
      instructions: () => {
        callCount++;
        throw new Error('Dynamic instruction failure');
      },
      model: 'gemini-2.0-flash',
    });

    const stream = agent.session().sendStream('Say hello.');

    await expect(async () => {
      for await (const _event of stream) {
        // consume stream
      }
    }).rejects.toThrow('Dynamic instruction failure');

    expect(callCount).toBe(1);
  });
});
