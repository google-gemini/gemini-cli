/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
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
} from './mcpServerEnablement.js';

const inMemoryFs: { [key: string]: string } = {};

describe('McpServerEnablementManager', () => {
  let manager: McpServerEnablementManager;

  beforeEach(() => {
    for (const key in inMemoryFs) delete inMemoryFs[key];

    vi.spyOn(fs, 'readFileSync').mockImplementation((path) => {
      const content = inMemoryFs[path.toString()];
      if (content === undefined) {
        const error = new Error(`ENOENT: ${path}`);
        (error as NodeJS.ErrnoException).code = 'ENOENT';
        throw error;
      }
      return content;
    });
    vi.spyOn(fs, 'writeFileSync').mockImplementation((path, data) => {
      inMemoryFs[path.toString()] = data.toString();
    });
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

    manager = new McpServerEnablementManager();
  });

  afterEach(() => vi.restoreAllMocks());

  it('should enable/disable servers with persistence', () => {
    expect(manager.isFileEnabled('server')).toBe(true);
    manager.disable('server');
    expect(manager.isFileEnabled('server')).toBe(false);
    manager.enable('server');
    expect(manager.isFileEnabled('server')).toBe(true);
  });

  it('should handle session disable separately', () => {
    manager.disableForSession('server');
    expect(manager.isSessionDisabled('server')).toBe(true);
    expect(manager.isFileEnabled('server')).toBe(true);
    expect(manager.isEffectivelyEnabled('server')).toBe(false);
    manager.clearSessionDisable('server');
    expect(manager.isEffectivelyEnabled('server')).toBe(true);
  });

  it('should be case-insensitive', () => {
    manager.disable('PlayWright');
    expect(manager.isFileEnabled('playwright')).toBe(false);
  });

  it('should return correct display state', () => {
    manager.disable('file-disabled');
    manager.disableForSession('session-disabled');

    expect(manager.getDisplayState('enabled')).toEqual({
      enabled: true,
      isSessionDisabled: false,
      isPersistentDisabled: false,
    });
    expect(manager.getDisplayState('file-disabled').isPersistentDisabled).toBe(
      true,
    );
    expect(manager.getDisplayState('session-disabled').isSessionDisabled).toBe(
      true,
    );
  });
});

describe('canLoadServer', () => {
  it('should check precedence: admin > allowlist > excludelist > session > file', () => {
    expect(canLoadServer('s', { adminMcpEnabled: false }).blockType).toBe(
      'admin',
    );
    expect(
      canLoadServer('s', { adminMcpEnabled: true, allowedList: ['other'] })
        .blockType,
    ).toBe('allowlist');
    expect(
      canLoadServer('s', { adminMcpEnabled: true, excludedList: ['s'] })
        .blockType,
    ).toBe('excludelist');
    expect(
      canLoadServer('s', {
        adminMcpEnabled: true,
        enablement: {
          isSessionDisabled: () => true,
          isFileEnabled: () => true,
        },
      }).blockType,
    ).toBe('session');
    expect(
      canLoadServer('s', {
        adminMcpEnabled: true,
        enablement: {
          isSessionDisabled: () => false,
          isFileEnabled: () => false,
        },
      }).blockType,
    ).toBe('enablement');
  });

  it('should allow when all checks pass', () => {
    expect(canLoadServer('s', { adminMcpEnabled: true }).allowed).toBe(true);
    expect(
      canLoadServer('s', {
        adminMcpEnabled: true,
        allowedList: ['s'],
        enablement: {
          isSessionDisabled: () => false,
          isFileEnabled: () => true,
        },
      }).allowed,
    ).toBe(true);
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
