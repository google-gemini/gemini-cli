/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    Storage: {
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      ...actual.Storage,
      getGlobalGeminiDir: () => '/virtual-home/.gemini',
    },
  };
});

import { coreEvents } from '@google/gemini-cli-core';
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
    const normPath = path.normalize(filePath.toString());
    const content = inMemoryFs[normPath];
    if (content === undefined) {
      const error = new Error(`ENOENT: ${filePath}`);
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      throw error;
    }
    return content;
  });
  vi.spyOn(fs, 'writeFile').mockImplementation(async (filePath, data) => {
    const normPath = path.normalize(filePath.toString());
    inMemoryFs[normPath] = data.toString();
  });
  vi.spyOn(fs, 'mkdir').mockImplementation(async () => undefined);
}

describe('McpServerEnablementManager', () => {
  let manager: McpServerEnablementManager;

  beforeEach(() => {
    inMemoryFs = {};
    setupFsMocks();
    McpServerEnablementManager.resetInstance();
    manager = McpServerEnablementManager.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    McpServerEnablementManager.resetInstance();
  });

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

  it('should share session state across getInstance calls', () => {
    const instance1 = McpServerEnablementManager.getInstance();
    const instance2 = McpServerEnablementManager.getInstance();

    instance1.disableForSession('test-server');

    expect(instance2.isSessionDisabled('test-server')).toBe(true);
    expect(instance1).toBe(instance2);
  });

  it('returns false for isFileEnabled when JSON content is corrupted', async () => {
    const configPath = path.normalize(
      '/virtual-home/.gemini/mcp-server-enablement.json',
    );
    inMemoryFs[configPath] = '{ invalid json syntax';

    expect(await manager.isFileEnabled('some-server')).toBe(false);
  });

  it.each(['null', '[1, 2, 3]', '"a string"', '123'])(
    'returns false for isFileEnabled when JSON is valid but not an object (%s)',
    async (content) => {
      const configPath = path.normalize(
        '/virtual-home/.gemini/mcp-server-enablement.json',
      );
      inMemoryFs[configPath] = content;

      expect(await manager.isFileEnabled('some-server')).toBe(false);
    },
  );

  it('throws and preserves file when calling disable() or enable() on corrupt config', async () => {
    const configPath = path.normalize(
      '/virtual-home/.gemini/mcp-server-enablement.json',
    );
    inMemoryFs[configPath] = '{ corrupt json';
    const writeFileSpy = vi.spyOn(fs, 'writeFile');

    await expect(manager.disable('some-server')).rejects.toThrow(/corrupted/i);
    expect(writeFileSpy).not.toHaveBeenCalled();

    await expect(manager.enable('some-server')).rejects.toThrow(/corrupted/i);
    expect(writeFileSpy).not.toHaveBeenCalled();

    expect(inMemoryFs[configPath]).toBe('{ corrupt json');
  });

  it('handles autoEnableServers with corrupt config without throwing or reporting re-enabled servers', async () => {
    const configPath = path.normalize(
      '/virtual-home/.gemini/mcp-server-enablement.json',
    );
    inMemoryFs[configPath] = '{ corrupt json';
    const writeFileSpy = vi.spyOn(fs, 'writeFile');

    const result = await manager.autoEnableServers(['server1', 'server2']);
    expect(result).toEqual([]);
    expect(writeFileSpy).not.toHaveBeenCalled();
  });

  it('returns isPersistentDisabled: true for getDisplayState and getAllDisplayStates on corrupt config', async () => {
    const configPath = path.normalize(
      '/virtual-home/.gemini/mcp-server-enablement.json',
    );
    inMemoryFs[configPath] = '{ corrupt json';

    const state = await manager.getDisplayState('server1');
    expect(state).toEqual({
      enabled: false,
      isSessionDisabled: false,
      isPersistentDisabled: true,
    });

    const allStates = await manager.getAllDisplayStates(['server1', 'server2']);
    expect(allStates['server1']?.isPersistentDisabled).toBe(true);
    expect(allStates['server2']?.isPersistentDisabled).toBe(true);
  });

  it('emits coreEvents error feedback when corruption is detected', async () => {
    const feedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');
    const configPath = path.normalize(
      '/virtual-home/.gemini/mcp-server-enablement.json',
    );
    inMemoryFs[configPath] = '{ corrupt json';

    await manager.isFileEnabled('some-server');
    expect(feedbackSpy).toHaveBeenCalledWith(
      'error',
      'Failed to read MCP server enablement config.',
      expect.any(Error),
    );
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
