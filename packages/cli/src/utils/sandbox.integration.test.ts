/**
 * Integration test: starts a harmless Node process via GEMINI_SANDBOX_PROXY_COMMAND
 * to verify end-to-end proxy spawn works in real world (no mocking).
 *
 * This test will actually spawn a child process (Node). It should be reasonably fast.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startSandboxProxyIfConfigured } from './sandbox';
import path from 'node:path';

describe('sandbox integration', () => {
  let prevEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // save relevant env
    prevEnv.GEMINI_SANDBOX_PROXY_COMMAND = process.env.GEMINI_SANDBOX_PROXY_COMMAND;
  });

  afterEach(() => {
    // restore
    process.env.GEMINI_SANDBOX_PROXY_COMMAND = prevEnv.GEMINI_SANDBOX_PROXY_COMMAND;
  });

  it('spawns node -e "console.log(\'PROXY_OK\')"', async () => {
    // Use process.execPath to ensure we have an absolute node binary
    const nodePath = process.execPath;
    const cmdArray = JSON.stringify([nodePath, '-e', `console.log('PROXY_OK')`]);
    process.env.GEMINI_SANDBOX_PROXY_COMMAND = cmdArray;

    const cp = startSandboxProxyIfConfigured();
    expect(cp).toBeDefined();

    // collect stdout from child (stdio: pipe)
    const child = cp as any;
    let stdout = '';
    if (child.stdout) {
      child.stdout.on('data', (b: Buffer) => {
        stdout += b.toString();
      });
    }

    // Await child exit
    const exitCode: number = await new Promise((resolve) => {
      child.on('exit', (code: number) => resolve(code ?? -1));
      // fallback timeout to avoid flakiness
      setTimeout(() => resolve(-1), 5000);
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('PROXY_OK');
  }, 10000); // increase timeout a little for CI
});
