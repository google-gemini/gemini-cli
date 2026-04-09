/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { internalEvalTest } from './test-helper.js';
import { TestRig } from '@google/gemini-cli-test-utils';

// Mock TestRig to control API success/failure
vi.mock('@google/gemini-cli-test-utils', () => {
  return {
    TestRig: vi.fn().mockImplementation(() => ({
      setup: vi.fn(),
      run: vi.fn(),
      cleanup: vi.fn(),
      readToolLogs: vi.fn().mockReturnValue([]),
      _lastRunStderr: '',
    })),
  };
});

describe('evalTest reliability logic', () => {
  const LOG_DIR = path.resolve(process.cwd(), 'evals/logs');
  const RELIABILITY_LOG = path.join(LOG_DIR, 'api-reliability.jsonl');

  beforeEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(RELIABILITY_LOG)) {
      fs.unlinkSync(RELIABILITY_LOG);
    }
  });

  afterEach(() => {
    if (fs.existsSync(RELIABILITY_LOG)) {
      fs.unlinkSync(RELIABILITY_LOG);
    }
  });

  it('should retry 3 times on 500 INTERNAL error and then SKIP', async () => {
    const mockRig = new TestRig() as any;
    (TestRig as any).mockReturnValue(mockRig);

    // Simulate permanent 500 error
    mockRig.run.mockRejectedValue(new Error('status: INTERNAL - API Down'));

    // Execute the test function directly
    await internalEvalTest({
      name: 'test-api-failure',
      prompt: 'do something',
      assert: async () => {},
    });

    // Verify retries: 1 initial + 3 retries = 4 setups/runs
    expect(mockRig.run).toHaveBeenCalledTimes(4);

    // Verify log content
    const logContent = fs
      .readFileSync(RELIABILITY_LOG, 'utf-8')
      .trim()
      .split('\n');
    expect(logContent.length).toBe(4);

    const entries = logContent.map((line) => JSON.parse(line));
    expect(entries[0].status).toBe('RETRY');
    expect(entries[0].attempt).toBe(0);
    expect(entries[3].status).toBe('SKIP');
    expect(entries[3].attempt).toBe(3);
    expect(entries[3].testName).toBe('test-api-failure');
  });

  it('should fail immediately on non-500 errors (like assertion failures)', async () => {
    const mockRig = new TestRig() as any;
    (TestRig as any).mockReturnValue(mockRig);

    // Simulate a real logic error/bug
    mockRig.run.mockResolvedValue('Success');
    const assertError = new Error('Assertion failed: expected foo to be bar');

    // Expect the test function to throw immediately
    await expect(
      internalEvalTest({
        name: 'test-logic-failure',
        prompt: 'do something',
        assert: async () => {
          throw assertError;
        },
      }),
    ).rejects.toThrow('Assertion failed');

    // Verify NO retries: only 1 attempt
    expect(mockRig.run).toHaveBeenCalledTimes(1);

    // Verify NO reliability log was created (it's not an API error)
    expect(fs.existsSync(RELIABILITY_LOG)).toBe(false);
  });

  it('should recover if a retry succeeds', async () => {
    const mockRig = new TestRig() as any;
    (TestRig as any).mockReturnValue(mockRig);

    // Fail once, then succeed
    mockRig.run
      .mockRejectedValueOnce(new Error('status: INTERNAL'))
      .mockResolvedValueOnce('Success');

    await internalEvalTest({
      name: 'test-recovery',
      prompt: 'do something',
      assert: async () => {},
    });

    // Ran twice: initial (fail) + retry 1 (success)
    expect(mockRig.run).toHaveBeenCalledTimes(2);

    // Log should only have the one RETRY entry
    const logContent = fs
      .readFileSync(RELIABILITY_LOG, 'utf-8')
      .trim()
      .split('\n');
    expect(logContent.length).toBe(1);
    expect(JSON.parse(logContent[0]).status).toBe('RETRY');
  });

  it('should retry 3 times on 503 UNAVAILABLE error and then SKIP', async () => {
    const mockRig = new TestRig() as any;
    (TestRig as any).mockReturnValue(mockRig);

    // Simulate permanent 503 error
    mockRig.run.mockRejectedValue(
      new Error('status: UNAVAILABLE - Service Busy'),
    );

    await internalEvalTest({
      name: 'test-api-503',
      prompt: 'do something',
      assert: async () => {},
    });

    expect(mockRig.run).toHaveBeenCalledTimes(4);

    const logContent = fs
      .readFileSync(RELIABILITY_LOG, 'utf-8')
      .trim()
      .split('\n');
    const entries = logContent.map((line) => JSON.parse(line));
    expect(entries[0].errorCode).toBe('503');
    expect(entries[3].status).toBe('SKIP');
  });

  it('should throw if an absolute path is used in files', async () => {
    const mockRig = new TestRig() as any;
    (TestRig as any).mockReturnValue(mockRig);
    mockRig.testDir = path.resolve(process.cwd(), 'test-dir-tmp');
    if (!fs.existsSync(mockRig.testDir)) {
      fs.mkdirSync(mockRig.testDir, { recursive: true });
    }

    try {
      await expect(
        internalEvalTest({
          name: 'test-absolute-path',
          prompt: 'do something',
          files: {
            '/etc/passwd': 'hacked',
          },
          assert: async () => {},
        }),
      ).rejects.toThrow('Invalid file path in test case: /etc/passwd');
    } finally {
      if (fs.existsSync(mockRig.testDir)) {
        fs.rmSync(mockRig.testDir, { recursive: true, force: true });
      }
    }
  });

  it('should throw if directory traversal is detected in files', async () => {
    const mockRig = new TestRig() as any;
    (TestRig as any).mockReturnValue(mockRig);
    mockRig.testDir = path.resolve(process.cwd(), 'test-dir-tmp');

    // Create a mock test-dir
    if (!fs.existsSync(mockRig.testDir)) {
      fs.mkdirSync(mockRig.testDir, { recursive: true });
    }

    try {
      await expect(
        internalEvalTest({
          name: 'test-traversal',
          prompt: 'do something',
          files: {
            '../sensitive.txt': 'hacked',
          },
          assert: async () => {},
        }),
      ).rejects.toThrow('Invalid file path in test case: ../sensitive.txt');
    } finally {
      if (fs.existsSync(mockRig.testDir)) {
        fs.rmSync(mockRig.testDir, { recursive: true, force: true });
      }
    }
  });
});
