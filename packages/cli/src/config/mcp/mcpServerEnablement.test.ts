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
  McpServerEnablementConfigError,
  canLoadServer,
  normalizeServerId,
  isInSettingsList,
  type EnablementCallbacks,
} from './mcpServerEnablement.js';

// Derived the same way the manager derives it. A POSIX literal would not match
// the path.join() result on win32, where the whole suite runs in CI.
const CONFIG_PATH = path.join(
  '/virtual-home/.gemini',
  'mcp-server-enablement.json',
);

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
});

describe('McpServerEnablementManager with an unreadable config file', () => {
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

  it.each([
    ['malformed JSON', '{"playwright": {"enabled": false'],
    ['a JSON array', '["playwright"]'],
    ['a JSON scalar', '"playwright"'],
    ['entries that are not enablement states', '{"playwright": "off"}'],
    [
      'an entry with a non-boolean enabled',
      '{"playwright": {"enabled": "no"}}',
    ],
  ])(
    'fails closed on %s rather than reporting every server enabled',
    async (_label, content) => {
      inMemoryFs[CONFIG_PATH] = content;

      expect(await manager.isFileEnabled('playwright')).toBe(false);
      expect(await manager.isFileEnabled('never-configured')).toBe(false);
    },
  );

  it('reports servers as persistently disabled in the display state', async () => {
    inMemoryFs[CONFIG_PATH] = '{ truncated';

    expect(await manager.getDisplayState('playwright')).toEqual({
      enabled: false,
      isSessionDisabled: false,
      isPersistentDisabled: true,
    });
  });

  it('refuses to disable a server and leaves the file untouched', async () => {
    const original = '{"playwright": {"enabled": false}, "github": ';
    inMemoryFs[CONFIG_PATH] = original;

    await expect(manager.disable('other')).rejects.toBeInstanceOf(
      McpServerEnablementConfigError,
    );
    expect(inMemoryFs[CONFIG_PATH]).toBe(original);
  });

  it('refuses to enable a server and leaves the file untouched', async () => {
    const original = '{"playwright": {"enabled": false}, "github": ';
    inMemoryFs[CONFIG_PATH] = original;

    await expect(manager.enable('playwright')).rejects.toBeInstanceOf(
      McpServerEnablementConfigError,
    );
    expect(inMemoryFs[CONFIG_PATH]).toBe(original);
  });

  it('names the config file so the user can repair it', async () => {
    inMemoryFs[CONFIG_PATH] = '{ truncated';

    await expect(manager.disable('playwright')).rejects.toThrow(CONFIG_PATH);
  });

  it('auto-enable re-enables nothing and does not throw', async () => {
    inMemoryFs[CONFIG_PATH] = '{ truncated';

    await expect(manager.autoEnableServers(['playwright'])).resolves.toEqual(
      [],
    );
    expect(inMemoryFs[CONFIG_PATH]).toBe('{ truncated');
  });

  it('recovers once the file is repaired', async () => {
    inMemoryFs[CONFIG_PATH] = '{ truncated';
    expect(await manager.isFileEnabled('playwright')).toBe(false);

    inMemoryFs[CONFIG_PATH] = '{"playwright": {"enabled": false}}';
    expect(await manager.isFileEnabled('playwright')).toBe(false);
    expect(await manager.isFileEnabled('github')).toBe(true);

    await manager.enable('playwright');
    expect(await manager.isFileEnabled('playwright')).toBe(true);
  });

  it('still treats a missing file as an empty config', async () => {
    expect(await manager.isFileEnabled('playwright')).toBe(true);
    await expect(manager.enable('playwright')).resolves.toBeUndefined();
  });

  it('fails closed when the file exists but cannot be read at all', async () => {
    // Every other case here supplies readable bytes and fails at JSON.parse or
    // the shape check, so without this the non-ENOENT arm of the read catch is
    // never driven.
    vi.spyOn(fs, 'readFile').mockImplementation(async () => {
      const error = new Error('EACCES: permission denied');
      (error as NodeJS.ErrnoException).code = 'EACCES';
      throw error;
    });

    expect(await manager.isFileEnabled('playwright')).toBe(false);
    await expect(manager.disable('playwright')).rejects.toBeInstanceOf(
      McpServerEnablementConfigError,
    );
  });

  it('reports an unreadable config once per stretch, not once per read', async () => {
    // isFileEnabled runs for every server on every connection attempt, so an
    // unconditional emit would bury the message in copies of itself.
    const emitFeedback = vi
      .spyOn(coreEvents, 'emitFeedback')
      .mockImplementation(() => {});
    inMemoryFs[CONFIG_PATH] = '{ truncated';

    await manager.isFileEnabled('playwright');
    await manager.isFileEnabled('github');
    await manager.isFileEnabled('other');
    expect(emitFeedback).toHaveBeenCalledTimes(1);
    expect(emitFeedback.mock.calls[0][1]).toContain(CONFIG_PATH);

    // A successful read rearms it, so a second episode is reported again.
    inMemoryFs[CONFIG_PATH] = '{"playwright": {"enabled": false}}';
    await manager.isFileEnabled('playwright');
    inMemoryFs[CONFIG_PATH] = '{ truncated again';
    await manager.isFileEnabled('playwright');
    expect(emitFeedback).toHaveBeenCalledTimes(2);
  });

  it('accepts entries carrying unknown extra fields', async () => {
    inMemoryFs[CONFIG_PATH] =
      '{"playwright": {"enabled": false, "disabledAt": "2026-01-01"}}';

    expect(await manager.isFileEnabled('playwright')).toBe(false);
    expect(await manager.isFileEnabled('github')).toBe(true);
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
