/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { findSandboxEnvFile } from '../sandbox_command.js';

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  const cleanups: Array<Promise<void>> = [];
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      cleanups.push(rm(dir, { recursive: true, force: true }));
    }
  }
  return Promise.all(cleanups);
});

describe('findSandboxEnvFile', () => {
  it('prefers project .gemini/.env before user config .env', async () => {
    const root = await makeTempDir('sandbox-command-project-first-');
    const homeDir = path.join(root, 'home');
    const workDir = path.join(root, 'workspace');
    const projectGeminiDir = path.join(workDir, '.gemini');
    const userConfigDir = path.join(homeDir, '.config', 'gemini-cli');
    const projectEnvPath = path.join(projectGeminiDir, '.env');
    const userEnvPath = path.join(userConfigDir, '.env');

    await mkdir(projectGeminiDir, { recursive: true });
    await mkdir(userConfigDir, { recursive: true });
    await writeFile(projectEnvPath, 'GEMINI_SANDBOX=from_project\n');
    await writeFile(userEnvPath, 'GEMINI_SANDBOX=from_user\n');

    const envPath = findSandboxEnvFile(workDir, userConfigDir);
    expect(envPath).toBe(projectEnvPath);
  });

  it('falls back to user config .env after reaching filesystem root', async () => {
    const root = await makeTempDir('sandbox-command-user-fallback-');
    const homeDir = path.join(root, 'home');
    const workDir = path.join(root, 'workspace');
    const userConfigDir = path.join(homeDir, '.config', 'gemini-cli');
    const userEnvPath = path.join(userConfigDir, '.env');

    await mkdir(workDir, { recursive: true });
    await mkdir(userConfigDir, { recursive: true });
    await writeFile(userEnvPath, 'GEMINI_SANDBOX=from_user\n');

    const envPath = findSandboxEnvFile(workDir, userConfigDir);
    expect(envPath).toBe(userEnvPath);
  });
});
