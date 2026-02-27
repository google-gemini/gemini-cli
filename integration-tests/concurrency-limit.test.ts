/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';

describe('web-fetch rate limiting', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    if (rig) {
      await rig.cleanup();
    }
  });

  it('should rate limit multiple requests to the same host', async () => {
    rig.setup('web-fetch rate limit', {
      settings: { tools: { core: ['web_fetch'] } },
      fakeResponsesPath: join(
        import.meta.dirname,
        'concurrency-limit.responses',
      ),
    });

    const result = await rig.run({
      args: `Fetch 11 pages from example.com`,
    });

    // We expect to find at least one tool call that failed with a rate limit error.
    const toolLogs = rig.readToolLogs();
    const rateLimitedCalls = toolLogs.filter(
      (log) =>
        log.toolRequest.name === 'web_fetch' &&
        log.toolRequest.error?.includes('Rate limit exceeded'),
    );

    expect(rateLimitedCalls.length).toBeGreaterThan(0);
    expect(result).toContain('Rate limit exceeded');
  });
});
