/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type IPty } from 'node-pty';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const CLI_PATH = path.resolve(
  process.cwd(),
  '../../packages/cli/dist/index.js',
);
const VIM_NORMAL_INDICATOR = '[NORMAL]';

// Helper function to wait for the terminal output to contain a specific string.
const waitForOutput = (
  pty: IPty,
  expected: string,
  timeout = 5000,
): Promise<string> =>
  new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(
      () =>
        reject(
          new Error(`Timeout waiting for "${expected}". Output: ${output}`),
        ),
      timeout,
    );

    const disposable = pty.onData((data) => {
      output += data;
      if (output.includes(expected)) {
        clearTimeout(timer);
        disposable.dispose();
        resolve(output);
      }
    });
  });

// Mock the GeminiClient to prevent actual API calls
vi.mock('@gemini-cli/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gemini-cli/core')>();
  return {
    ...actual,
    GeminiClient: vi.fn(() => ({
      getChat: vi.fn(() => ({
        sendMessageStream: vi.fn(),
        getHistory: vi.fn(() => []),
      })),
    })),
    loadServerHierarchicalMemory: vi.fn(() =>
      Promise.resolve({ memoryContent: '', fileCount: 0 }),
    ),
  };
});

describe('Vim Mode E2E', () => {
  let tempDir: string;
  let ptyProcess: IPty;

  beforeAll(async () => {
    // Create a temporary directory for our settings file
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-cli-test-'));
  });

  afterAll(async () => {
    // Clean up the temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should start with vim mode enabled when configured in settings', async () => {
    // Mock os.homedir() to point to our temporary directory
    vi.spyOn(os, 'homedir').mockReturnValue(tempDir);

    // Create the settings file in the temporary directory
    const settings = {
      vimMode: true,
      'cli.theme': 'default',
      'user.acknowledgedUsageStrobing': true,
    };
    await fs.mkdir(path.join(tempDir, '.gemini'));
    await fs.writeFile(
      path.join(tempDir, '.gemini', 'settings.json'),
      JSON.stringify(settings),
    );

    ptyProcess = spawn('node', [CLI_PATH], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.cwd(), // Run from the actual CWD
      env: {
        ...process.env,
        // No need to set HOME anymore, since we mock homedir()
        GEMINI_API_KEY: 'test-key',
      },
    });

    // 1. Wait for the initial prompt to ensure the app is ready
    await waitForOutput(
      ptyProcess,
      'Type your message or @path/to/file',
      10000,
    );

    // 2. Assert that the Vim mode indicator is visible
    const output = await waitForOutput(ptyProcess, VIM_NORMAL_INDICATOR);
    expect(output).toContain(VIM_NORMAL_INDICATOR);

    ptyProcess.kill();
  }, 20000);
});
