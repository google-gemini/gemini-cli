/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import type * as osActual from 'node:os';

vi.mock('node:os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof osActual>();
  return {
    ...actualOs,
    homedir: vi.fn(() => path.resolve('/mock/home')),
    platform: vi.fn(() => 'linux'),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: vi.fn(() => path.resolve('/mock/home')),
  };
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { loadEnvironment, type Settings } from './settings.js';
import { GEMINI_DIR, homedir as coreHomedir } from '@google/gemini-cli-core';

vi.mock('node:fs');

describe('Environment Isolation', () => {
  const mockHome = path.resolve('/mock/home');
  const mockWorkspace = path.resolve('/mock/workspace');
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };
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
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue(mockHome);
    vi.mocked(coreHomedir).mockReturnValue(mockHome);
    // Default to no files existing
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.argv = ['node', 'gemini'];

    // Clear env vars that might leak from the host environment
    delete process.env['GEMINI_API_KEY'];
    delete process.env['OTHER_VAR'];
    for (const key of gitEnvKeys) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = { ...originalEnv };
  });

  it('should load local .env by default', () => {
    const workspaceEnv = path.join(mockWorkspace, '.env');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p.toString() === workspaceEnv,
    );
    vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_API_KEY=local');

    const settings = { advanced: { ignoreLocalEnv: false } } as Settings;
    loadEnvironment(settings, mockWorkspace, () => ({
      isTrusted: true,
      source: 'file',
    }));

    expect(process.env['GEMINI_API_KEY']).toBe('local');
    delete process.env['GEMINI_API_KEY'];
  });

  it('should ignore local .env when ignoreLocalEnv is true', () => {
    const workspaceEnv = path.join(mockWorkspace, '.env');
    const homeEnv = path.join(mockHome, '.env');

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const ps = p.toString();
      return ps === workspaceEnv || ps === homeEnv;
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const ps = p.toString();
      if (ps === workspaceEnv) return 'GEMINI_API_KEY=local';
      if (ps === homeEnv) return 'GEMINI_API_KEY=home';
      return '';
    });

    const settings = { advanced: { ignoreLocalEnv: true } } as Settings;
    loadEnvironment(settings, mockWorkspace, () => ({
      isTrusted: true,
      source: 'file',
    }));

    // Should skip local and find home
    expect(process.env['GEMINI_API_KEY']).toBe('home');
    delete process.env['GEMINI_API_KEY'];
  });

  it('should still load .gemini/.env even if ignoreLocalEnv is true', () => {
    const workspaceGeminiEnv = path.join(mockWorkspace, GEMINI_DIR, '.env');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p.toString() === workspaceGeminiEnv,
    );
    vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_API_KEY=gemini-local');

    const settings = { advanced: { ignoreLocalEnv: true } } as Settings;
    loadEnvironment(settings, mockWorkspace, () => ({
      isTrusted: true,
      source: 'file',
    }));

    expect(process.env['GEMINI_API_KEY']).toBe('gemini-local');
    delete process.env['GEMINI_API_KEY'];
  });

  it('should respect --ignore-env flag', () => {
    const workspaceEnv = path.join(mockWorkspace, '.env');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p.toString() === workspaceEnv,
    );
    vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_API_KEY=local');

    process.argv = ['node', 'gemini', '--ignore-env'];
    const settings = { advanced: { ignoreLocalEnv: false } } as Settings;
    loadEnvironment(settings, mockWorkspace, () => ({
      isTrusted: true,
      source: 'file',
    }));

    expect(process.env['GEMINI_API_KEY']).toBeUndefined();
  });

  it('should allow home .env even with ignoreLocalEnv true', () => {
    const homeEnv = path.join(mockHome, '.env');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p.toString() === homeEnv,
    );
    vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_API_KEY=home');

    const settings = { advanced: { ignoreLocalEnv: true } } as Settings;
    // Running from home dir
    loadEnvironment(settings, mockHome, () => ({
      isTrusted: true,
      source: 'file',
    }));

    expect(process.env['GEMINI_API_KEY']).toBe('home');
    delete process.env['GEMINI_API_KEY'];
  });

  it('should skip local .env and its parents until home when ignoreLocalEnv is true', () => {
    const deepProject = path.join(mockWorkspace, 'deep', 'dir');
    const deepEnv = path.join(deepProject, '.env');
    const parentEnv = path.join(mockWorkspace, '.env');
    const homeEnv = path.join(mockHome, '.env');

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const ps = p.toString();
      return ps === deepEnv || ps === parentEnv || ps === homeEnv;
    });
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      const ps = p.toString();
      if (ps === deepEnv) return 'GEMINI_API_KEY=deep';
      if (ps === parentEnv) return 'GEMINI_API_KEY=parent';
      if (ps === homeEnv) return 'GEMINI_API_KEY=home';
      return '';
    });

    const settings = { advanced: { ignoreLocalEnv: true } } as Settings;
    loadEnvironment(settings, deepProject, () => ({
      isTrusted: true,
      source: 'file',
    }));

    expect(process.env['GEMINI_API_KEY']).toBe('home');
    delete process.env['GEMINI_API_KEY'];
  });

  it('should respect trust whitelist even when loading from home .env', () => {
    const homeEnv = path.join(mockHome, '.env');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p.toString() === homeEnv,
    );
    // Include one whitelisted and one non-whitelisted variable
    vi.mocked(fs.readFileSync).mockReturnValue(
      'GEMINI_API_KEY=home\nOTHER_VAR=secret',
    );

    const settings = { advanced: { ignoreLocalEnv: true } } as Settings;
    // Running from an UNTRUSTED workspace
    loadEnvironment(settings, mockWorkspace, () => ({
      isTrusted: false,
      source: 'file',
    }));

    expect(process.env['GEMINI_API_KEY']).toBe('home');
    expect(process.env['OTHER_VAR']).toBeUndefined();
    delete process.env['GEMINI_API_KEY'];
  });

  it('should prioritize --ignore-env flag even if setting is false', () => {
    const workspaceEnv = path.join(mockWorkspace, '.env');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p.toString() === workspaceEnv,
    );
    vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_API_KEY=local');

    process.argv = ['node', 'gemini', '--ignore-env'];
    const settings = { advanced: { ignoreLocalEnv: false } } as Settings;
    loadEnvironment(settings, mockWorkspace, () => ({
      isTrusted: true,
      source: 'file',
    }));

    expect(process.env['GEMINI_API_KEY']).toBeUndefined();
  });

  it('should respect both -s and --ignore-env flags simultaneously', () => {
    const workspaceEnv = path.join(mockWorkspace, '.env');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p.toString() === workspaceEnv,
    );
    vi.mocked(fs.readFileSync).mockReturnValue('GEMINI_API_KEY=local');

    process.argv = ['node', 'gemini', '-s', '--ignore-env'];
    const settings = { advanced: { ignoreLocalEnv: false } } as Settings;
    loadEnvironment(settings, mockWorkspace, () => ({
      isTrusted: true,
      source: 'file',
    }));

    expect(process.env['GEMINI_API_KEY']).toBeUndefined();
  });

  it('rejects Git variables from a trusted workspace .env even with empty exclusions', () => {
    const workspaceEnv = path.join(mockWorkspace, '.env');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p.toString() === workspaceEnv,
    );
    vi.mocked(fs.readFileSync).mockReturnValue(
      [
        ...gitEnvKeys.map((key) => `${key}=file-value`),
        'OTHER_VAR=loaded',
      ].join('\n'),
    );

    const settings = { advanced: { excludedEnvVars: [] } } as Settings;
    loadEnvironment(settings, mockWorkspace, () => ({
      isTrusted: true,
      source: 'file',
    }));

    for (const key of gitEnvKeys) {
      expect(process.env[key]).toBeUndefined();
    }
    expect(process.env['OTHER_VAR']).toBe('loaded');
  });

  it('rejects Git variables from workspace .gemini/.env', () => {
    const workspaceEnv = path.join(mockWorkspace, GEMINI_DIR, '.env');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p.toString() === workspaceEnv,
    );
    vi.mocked(fs.readFileSync).mockReturnValue(
      'GIT_ALLOW_PROTOCOL=file-value\ngIt_MiXeD_OpTiOn=file-value\nOTHER_VAR=loaded',
    );

    const settings = {
      advanced: { ignoreLocalEnv: true, excludedEnvVars: [] },
    } as Settings;
    loadEnvironment(settings, mockWorkspace, () => ({
      isTrusted: true,
      source: 'file',
    }));

    expect(process.env['GIT_ALLOW_PROTOCOL']).toBeUndefined();
    expect(process.env['gIt_MiXeD_OpTiOn']).toBeUndefined();
    expect(process.env['OTHER_VAR']).toBe('loaded');
  });

  it('rejects Git variables from the home .env fallback', () => {
    const homeEnv = path.join(mockHome, '.env');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p.toString() === homeEnv,
    );
    vi.mocked(fs.readFileSync).mockReturnValue(
      'GIT_CONFIG_PARAMETERS=file-value\nOTHER_VAR=loaded',
    );

    const settings = { advanced: { ignoreLocalEnv: true } } as Settings;
    loadEnvironment(settings, mockWorkspace, () => ({
      isTrusted: true,
      source: 'file',
    }));

    expect(process.env['GIT_CONFIG_PARAMETERS']).toBeUndefined();
    expect(process.env['OTHER_VAR']).toBe('loaded');
  });

  it('preserves Git variables already supplied by the shell', () => {
    const workspaceEnv = path.join(mockWorkspace, '.env');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p.toString() === workspaceEnv,
    );
    vi.mocked(fs.readFileSync).mockReturnValue(
      'GIT_SSH_COMMAND=file-value\nGIT_ALLOW_PROTOCOL=file-value\nOTHER_VAR=loaded',
    );
    process.env['GIT_SSH_COMMAND'] = 'shell-ssh';
    process.env['GIT_ALLOW_PROTOCOL'] = 'shell-protocol';

    loadEnvironment({} as Settings, mockWorkspace, () => ({
      isTrusted: true,
      source: 'file',
    }));

    expect(process.env['GIT_SSH_COMMAND']).toBe('shell-ssh');
    expect(process.env['GIT_ALLOW_PROTOCOL']).toBe('shell-protocol');
    expect(process.env['OTHER_VAR']).toBe('loaded');
  });

  it('keeps the file boundary across repeated loads', () => {
    const workspaceEnv = path.join(mockWorkspace, '.env');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p.toString() === workspaceEnv,
    );
    vi.mocked(fs.readFileSync).mockReturnValue(
      'GIT_FUTURE_OPTION=file-value\nOTHER_VAR=loaded',
    );

    const trust = () => ({ isTrusted: true, source: 'file' }) as const;
    loadEnvironment({} as Settings, mockWorkspace, trust);
    loadEnvironment({} as Settings, mockWorkspace, trust);

    expect(process.env['GIT_FUTURE_OPTION']).toBeUndefined();
    expect(process.env['OTHER_VAR']).toBe('loaded');
  });

  it('still applies custom exclusions to non-Git project variables', () => {
    const workspaceEnv = path.join(mockWorkspace, '.env');
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p.toString() === workspaceEnv,
    );
    vi.mocked(fs.readFileSync).mockReturnValue(
      'OTHER_VAR=excluded\nGEMINI_API_KEY=loaded',
    );

    const settings = {
      advanced: { excludedEnvVars: ['OTHER_VAR'] },
    } as Settings;
    loadEnvironment(settings, mockWorkspace, () => ({
      isTrusted: true,
      source: 'file',
    }));

    expect(process.env['OTHER_VAR']).toBeUndefined();
    expect(process.env['GEMINI_API_KEY']).toBe('loaded');
  });
});
