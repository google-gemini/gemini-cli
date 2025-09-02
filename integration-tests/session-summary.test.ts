/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestRig } from './test-helper.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

describe('session-summary flag', () => {
  let rig: TestRig;

  beforeEach(function (context) {
    rig = new TestRig();
    if (context.task.name) {
      rig.setup(context.task.name);
    }
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should write a session summary in non-interactive mode', async () => {
    const summaryPath = join(rig.testDir!, 'summary.json');
    await rig.run('Say hello', '--session-summary', summaryPath);

    const summaryContent = readFileSync(summaryPath, 'utf-8');
    const summary = JSON.parse(summaryContent);

    expect(summary).toBeDefined();
    expect(summary.sessionMetrics.models).toBeDefined();
    expect(summary.sessionMetrics.tools).toBeDefined();
  });
});
