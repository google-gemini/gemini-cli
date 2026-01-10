/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    Storage: {
      ...actual.Storage,
      getGlobalGeminiDir: () => '/virtual-home/.gemini',
    },
  };
});

import {
  McpServerEnablementManager,
  canLoadServer,
  normalizeServerId,
  isInSettingsList,
  type EnablementCallbacks,
} from './mcpServerEnablement.js';

let inMemoryFs: Record<string, string> = {};

function createMockEnablement(
  sessionDisabled: boolean,
  fileEnabled: boolean,
): EnablementCallbacks {
  return {
    isSessionDisabled: () => sessionDisabled,
    isFileEnabled: () => Promise.resolve(fileEnabled),
  };
}

function setupFsMocks(): void {
  vi.spyOn(fs, 'readFile').mockImplementation(async (filePath) => {
    const content = inMemoryFs[filePath.toString()];
    if (content === undefined) {
      const error = new Error(`ENOENT: ${filePath}`);
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      throw error;
    }
    return content;
  });
  vi.spyOn(fs, 'writeFile').mockImplementation(async (filePath, data) => {
    inMemoryFs[filePath.toString()] = data.toString();
  });
  vi.spyOn(fs, 'mkdir').mockImplementation(async () => undefined);
}

describe('McpServerEnablementManager', () => {
  let manager: McpServerEnablementManager;

  beforeEach(() => {
    inMemoryFs = {};
    setupFsMocks();
    manager = new McpServerEnablementManager();
  });

  afterEach(() => vi.restoreAllMocks());

  it('should enable/disable servers with persistence', async () => {
    expect(await manager.isFileEnabled('server')).toBe(true);
    await manager.disable('server');
    expect(await manager.isFileEnabled('server')).toBe(false);
    await manager.enable('server');
    expect(await manager.isFileEnabled('server')).toBe(true);
  });

  it('should handle session disable separately', async () => {
    manager.disableForSession('server');
    expect(manager.isSessionDisabled('server')).toBe(true);
    expect(await manager.isFileEnabled('server')).toBe(true);
    expect(await manager.isEffectivelyEnabled('server')).toBe(false);
    manager.clearSessionDisable('server');
    expect(await manager.isEffectivelyEnabled('server')).toBe(true);
  });

  it('should be case-insensitive', async () => {
    await manager.disable('PlayWright');
    expect(await manager.isFileEnabled('playwright')).toBe(false);
  });

  it('should return correct display state', async () => {
    await manager.disable('file-disabled');
    manager.disableForSession('session-disabled');

    expect(await manager.getDisplayState('enabled')).toEqual({
      enabled: true,
      isSessionDisabled: false,
      isPersistentDisabled: false,
    });
    expect(
      (await manager.getDisplayState('file-disabled')).isPersistentDisabled,
    ).toBe(true);
    expect(
      (await manager.getDisplayState('session-disabled')).isSessionDisabled,
    ).toBe(true);
  });
});

describe('canLoadServer', () => {
  it('blocks when admin has disabled MCP', async () => {
    const result = await canLoadServer('s', { adminMcpEnabled: false });
    expect(result.blockType).toBe('admin');
  });

  it('blocks when server is not in allowlist', async () => {
    const result = await canLoadServer('s', {
      adminMcpEnabled: true,
      allowedList: ['other'],
    });
    expect(result.blockType).toBe('allowlist');
  });

  it('blocks when server is in excludelist', async () => {
    const result = await canLoadServer('s', {
      adminMcpEnabled: true,
      excludedList: ['s'],
    });
    expect(result.blockType).toBe('excludelist');
  });

  it('blocks when server is session-disabled', async () => {
    const result = await canLoadServer('s', {
      adminMcpEnabled: true,
      enablement: createMockEnablement(true, true),
    });
    expect(result.blockType).toBe('session');
  });

  it('blocks when server is file-disabled', async () => {
    const result = await canLoadServer('s', {
      adminMcpEnabled: true,
      enablement: createMockEnablement(false, false),
    });
    expect(result.blockType).toBe('enablement');
  });

  it('allows when admin MCP is enabled and no restrictions', async () => {
    const result = await canLoadServer('s', { adminMcpEnabled: true });
    expect(result.allowed).toBe(true);
  });

  it('allows when server passes all checks', async () => {
    const result = await canLoadServer('s', {
      adminMcpEnabled: true,
      allowedList: ['s'],
      enablement: createMockEnablement(false, true),
    });
    expect(result.allowed).toBe(true);
  });
});

describe('helper functions', () => {
  it('normalizeServerId lowercases and trims', () => {
    expect(normalizeServerId('  PlayWright  ')).toBe('playwright');
  });

  it('isInSettingsList supports ext: backward compat', () => {
    expect(isInSettingsList('playwright', ['playwright']).found).toBe(true);
    expect(isInSettingsList('ext:github:mcp', ['mcp']).found).toBe(true);
    expect(
      isInSettingsList('ext:github:mcp', ['mcp']).deprecationWarning,
    ).toBeTruthy();
  });
});
