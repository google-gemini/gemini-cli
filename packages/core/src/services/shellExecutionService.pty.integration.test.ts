/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import fsSync from 'node:fs';
import { ShellExecutionService } from './shellExecutionService.js';
import { NoopSandboxManager } from './sandboxManager.js';

const PTY_INTEGRATION_ENV_FLAG = 'GEMINI_PTY_INTEGRATION_TESTS';
const PTY_ITERATIONS = 64;
const PTY_BASELINE_FD_PROBE_COUNT = 4;

const shouldRun =
  process.env[PTY_INTEGRATION_ENV_FLAG] === '1' &&
  (os.platform() === 'darwin' || os.platform() === 'linux');

describe.runIf(shouldRun)(
  'ShellExecutionService PTY fd leak integration',
  () => {
    it('does not leak slave fds across rapid PTY executions', async () => {
      const getOpenFdCount = (): number => {
        try {
          return fsSync.readdirSync('/dev/fd').length;
        } catch {
          return 0;
        }
      };

      const baselineSamples: number[] = [];
      for (let i = 0; i < PTY_BASELINE_FD_PROBE_COUNT; i++) {
        baselineSamples.push(getOpenFdCount());
      }
      const baseline = Math.max(...baselineSamples);

      for (let i = 0; i < PTY_ITERATIONS; i++) {
        const handle = await ShellExecutionService.execute(
          'true',
          process.cwd(),
          () => {},
          new AbortController().signal,
          true,
          {
            sanitizationConfig: {
              enableEnvironmentVariableRedaction: false,
              allowedEnvironmentVariables: [],
              blockedEnvironmentVariables: [],
            },
            sandboxManager: new NoopSandboxManager(),
            sessionId: 'integration',
          },
        );
        await handle.result;
      }

      const finalCount = getOpenFdCount();
      expect(finalCount - baseline).toBeLessThan(PTY_ITERATIONS);
    }, 120000);
  },
);
