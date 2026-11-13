/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const mockHome = vi.hoisted(() => ({ dir: '' }));

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    homedir: () => mockHome.dir,
  };
});

import { loadEnvironment } from './config.js';

describe('A2A environment isolation', () => {
  let workspaceDir: string;
  const gitEnvKeys = [
    'GIT_EXEC_PATH',
    'GIT_SSH_COMMAND',
    'GIT_PROXY_COMMAND',
    'GIT_CONFIG_PARAMETERS',
    'GIT_ALLOW_PROTOCOL',
    'GIT_PROTOCOL_FROM_USER',
    'GIT_FUTURE_OPTION',
    'gIt_MiXeD_OpTiOn',
  ];

  beforeEach(() => {
    mockHome.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-a2a-home-'));
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-a2a-env-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(workspaceDir, { recursive: true, force: true });
    fs.rmSync(mockHome.dir, { recursive: true, force: true });
  });

  it('omits Git variables from a trusted workspace .env task map', async () => {
    fs.writeFileSync(
      path.join(workspaceDir, '.env'),
      [
        ...gitEnvKeys.map((key) => `${key}=file-value`),
        'OTHER_VAR=loaded',
      ].join('\n'),
    );

    const envVars = await loadEnvironment(true, workspaceDir);

    expect(Object.keys(envVars).filter((key) => /^git_/i.test(key))).toEqual(
      [],
    );
    expect(envVars['OTHER_VAR']).toBe('loaded');
  });

  it('omits Git variables from workspace .gemini/.env without changing shell values', async () => {
    const geminiDir = path.join(workspaceDir, '.gemini');
    fs.mkdirSync(geminiDir);
    fs.writeFileSync(
      path.join(geminiDir, '.env'),
      'GIT_SSH_COMMAND=file-value\nGIT_ALLOW_PROTOCOL=file-value\ngIt_MiXeD_OpTiOn=file-value\nOTHER_VAR=loaded',
    );
    vi.stubEnv('GIT_SSH_COMMAND', 'shell-ssh');
    vi.stubEnv('GIT_ALLOW_PROTOCOL', 'shell-protocol');

    const envVars = await loadEnvironment(true, workspaceDir);

    expect(Object.keys(envVars).filter((key) => /^git_/i.test(key))).toEqual(
      [],
    );
    expect(envVars['OTHER_VAR']).toBe('loaded');
    expect(process.env['GIT_SSH_COMMAND']).toBe('shell-ssh');
    expect(process.env['GIT_ALLOW_PROTOCOL']).toBe('shell-protocol');
  });

  it('omits Git variables from the home .env fallback', async () => {
    fs.writeFileSync(
      path.join(mockHome.dir, '.env'),
      'GIT_CONFIG_PARAMETERS=file-value\nOTHER_VAR=loaded',
    );

    const envVars = await loadEnvironment(false, workspaceDir);

    expect(envVars['GIT_CONFIG_PARAMETERS']).toBeUndefined();
    expect(envVars['OTHER_VAR']).toBe('loaded');
  });

  it('preserves inherited Git values when task envs are merged repeatedly', async () => {
    fs.writeFileSync(
      path.join(workspaceDir, '.env'),
      'GIT_SSH_COMMAND=file-value\nGIT_FUTURE_OPTION=file-value\nOTHER_VAR=loaded',
    );
    vi.stubEnv('GIT_SSH_COMMAND', 'shell-value');

    for (let i = 0; i < 2; i++) {
      const taskEnv = {
        ...process.env,
        ...(await loadEnvironment(true, workspaceDir)),
      };
      expect(taskEnv['GIT_SSH_COMMAND']).toBe('shell-value');
      expect(taskEnv['GIT_FUTURE_OPTION']).toBeUndefined();
      expect(taskEnv['OTHER_VAR']).toBe('loaded');
    }
  });
});
