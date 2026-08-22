/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const mockedPaths = vi.hoisted(() => ({
  home: '',
  tmp: '',
}));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: () => mockedPaths.home,
    tmpdir: () => mockedPaths.tmp,
  };
});

import { setTargetDir } from './config.js';
import { CoderAgentEvent } from '../types.js';

describe('setTargetDir workspace confinement', () => {
  let homeDir: string;
  let workspaceDir: string;
  let originalArgv: string[];

  beforeEach(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-a2a-home-'));
    workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-a2a-workspace-'),
    );
    mockedPaths.home = homeDir;
    // Make the production-only path check deterministic even though this test
    // itself runs under Vitest.
    mockedPaths.tmp = homeDir;

    originalArgv = process.argv;
    process.argv = ['node', 'a2a-server'];
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CODER_AGENT_WORKSPACE_PATH', undefined);
    vi.stubEnv('CODER_AGENT_ALLOWED_ROOT', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.argv = originalArgv;

    fs.rmSync(workspaceDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it('allows a launcher-provided workspace outside the home directory', async () => {
    vi.stubEnv('CODER_AGENT_WORKSPACE_PATH', workspaceDir);

    await expect(setTargetDir(undefined)).resolves.toBe(
      fs.realpathSync(workspaceDir),
    );
  });

  it('still honors an explicitly configured allowed root', async () => {
    vi.stubEnv('CODER_AGENT_WORKSPACE_PATH', workspaceDir);
    vi.stubEnv('CODER_AGENT_ALLOWED_ROOT', homeDir);

    await expect(setTargetDir(undefined)).rejects.toThrow(
      'outside the allowed root directory',
    );
  });

  it('keeps per-task workspace paths confined when no launcher path is set', async () => {
    await expect(
      setTargetDir({
        kind: CoderAgentEvent.StateAgentSettingsEvent,
        workspacePath: workspaceDir,
      }),
    ).rejects.toThrow('outside the allowed root directory');
  });
});
