/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestRig } from './test-helper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = join(__dirname, '..', 'bundle/gemini.js');

describe('stdout-stderr-output', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  function runWithStreams(
    args: string[],
    options?: { signal?: AbortSignal },
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
      const allArgs = rig.fakeResponsesPath
        ? [...args, '--fake-responses', rig.fakeResponsesPath]
        : args;

      const child = spawn('node', [BUNDLE_PATH, ...allArgs], {
        cwd: rig.testDir!,
        stdio: 'pipe',
        env: { ...process.env, GEMINI_CLI_HOME: rig.homeDir! },
        signal: options?.signal,
      });
      let stdout = '';
      let stderr = '';

      child.on('error', reject);

      child.stdout!.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr!.on('data', (chunk) => {
        stderr += chunk;
      });

      child.stdin!.end();
      child.on('close', (exitCode) => {
        resolve({ stdout, stderr, exitCode });
      });
    });
  }

  it('should send model response to stdout and app messages to stderr', async ({
    signal,
  }) => {
    await rig.setup('prompt-output-test', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'stdout-stderr-output.responses',
      ),
    });

    const { stdout, exitCode } = await runWithStreams(
      ['-p', 'Say hello', '--approval-mode', 'yolo'],
      { signal },
    );

    expect(exitCode).toBe(0);
    expect(stdout.toLowerCase()).toContain('hello');
    expect(stdout).not.toMatch(/^\[ERROR\]/m);
    expect(stdout).not.toMatch(/^\[INFO\]/m);
  });

  it('should send errors to stderr not stdout', async ({ signal }) => {
    await rig.setup('error-output-test');

    const { stdout, stderr, exitCode } = await runWithStreams(
      [
        '-p',
        '@nonexistent-file-that-does-not-exist.txt explain this',
        '--approval-mode',
        'yolo',
      ],
      { signal },
    );

    expect(exitCode).not.toBe(0);
    expect(stderr.toLowerCase()).toMatch(/error|not found|does not exist/);
    expect(stdout).toBe('');
  });
});
