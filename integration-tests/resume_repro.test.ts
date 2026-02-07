/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('resume-repro', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should be able to resume a session without "Storage must be initialized before use"', async () => {
    const responsesPath = path.join(__dirname, 'resume_repro.responses');
    await rig.setup('should be able to resume a session', {
      fakeResponsesPath: responsesPath,
    });

    // 1. First run to create a session
    await rig.run({
      args: 'hello',
    });

    // 2. Second run with --resume latest
    // This should NOT fail with "Storage must be initialized before use"
    const result = await rig.run({
      args: ['--resume', 'latest', 'continue'],
    });

    expect(result).toContain('Session started');
  });
});
