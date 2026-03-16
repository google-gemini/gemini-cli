/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LspServerManager } from './LspServerManager.js';
import { LspClient } from './LspClient.js';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawnSync: vi.fn(),
  };
});

vi.mock('./LspClient.js', () => ({
    LspClient: vi.fn().mockImplementation(() => ({
      initialize: vi.fn().mockResolvedValue({}),
      shutdown: vi.fn().mockResolvedValue({}),
      kill: vi.fn(),
    })),
  }));

describe('LspServerManager', () => {
  const projectRoot = process.cwd();

  beforeEach(() => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
    } as unknown as ReturnType<typeof spawnSync>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should shut down all clients when shutdownAll is called', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: Buffer.from('/usr/bin/ts-ls'),
      stderr: Buffer.from(''),
    } as unknown as ReturnType<typeof spawnSync>);

    const manager = new LspServerManager(projectRoot);

    // Get a client to populate the map
    await manager.getClientForFile('test.ts');

    const client = vi.mocked(LspClient).mock.results[0].value;

    await manager.shutdownAll();

    expect(client.shutdown).toHaveBeenCalled();
    expect(client.kill).toHaveBeenCalled();
  });

  it('should throw an error with a proactive hint if the binary is missing', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
    } as unknown as ReturnType<typeof spawnSync>);

    const manager = new LspServerManager(projectRoot);

    try {
      await manager.getClientForFile('test.go');
      expect.fail('Should have thrown an error');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      expect(message).toContain('gopls is missing');
      expect(message).toContain('go install');
    }
  });

  it('should throw a descriptive error if the check command (which/where) fails', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      error: new Error('command not found'),
      status: null,
    } as unknown as ReturnType<typeof spawnSync>);

    const manager = new LspServerManager(projectRoot);
    const checkCmd = process.platform === 'win32' ? 'where' : 'which';

    try {
      await manager.getClientForFile('test.go');
      expect.fail('Should have thrown an error');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      expect(message).toContain(
        `Failed to check for language server binary. Please ensure '${checkCmd}' is in your system's PATH.`,
      );
    }
  });

  it('should successfully get a client for an existing server (TypeScript)', async () => {
    // For this test, we need spawnSync to succeed for 'which/where'
    // but the LspClient itself will spawn the actual server.
    // We'll mock spawnSync to return status 0.
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: Buffer.from('/usr/local/bin/typescript-language-server'),
      stderr: Buffer.from(''),
    } as unknown as ReturnType<typeof spawnSync>);

    const manager = new LspServerManager(projectRoot);

    // Create a dummy .ts file
    const dummyFile = path.join(projectRoot, 'dummy-test-lsp.ts');
    fs.writeFileSync(dummyFile, 'const x = 1;');

    try {
      // Note: LspClient will still try to spawn the command, but since it's not mocked here,
      // it might fail if typescript-language-server is not installed.
      // However, the test was originally passing, so it likely is installed or LspClient is mocked?
      // Wait, LspClient is NOT mocked in LspServerManager.test.ts.
      // Let's keep the original behavior for the last test but ensure spawnSync (mocked) allows it to proceed.
      const client = await manager.getClientForFile(dummyFile);
      expect(client).toBeDefined();

      // Cleanup
      await manager.shutdownAll();
    } finally {
      if (fs.existsSync(dummyFile)) {
        fs.unlinkSync(dummyFile);
      }
    }
  }, 15000); // 15s timeout for server startup
});
