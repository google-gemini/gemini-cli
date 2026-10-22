/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse } from 'comment-json';
import { AuthType, coreEvents } from '@google/gemini-cli-core';
import {
  LoadedSettings,
  saveSettings,
  SettingScope,
  type Settings,
} from './settings.js';

describe('settings persistence with changes made after startup', () => {
  let tempDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-persistence-'));
    vi.stubEnv('GEMINI_CLI_HOME', tempDir);
    settingsPath = path.join(tempDir, '.gemini', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function writeSettings(settings: Settings): void {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }

  function readSettings(): unknown {
    return parse(fs.readFileSync(settingsPath, 'utf8'));
  }

  function settingsAtStartup(settings: Settings): LoadedSettings {
    return new LoadedSettings(
      { path: '', settings: {}, originalSettings: {}, readOnly: true },
      { path: '', settings: {}, originalSettings: {}, readOnly: true },
      {
        path: settingsPath,
        settings: structuredClone(settings),
        originalSettings: structuredClone(settings),
      },
      { path: '', settings: {}, originalSettings: {}, readOnly: true },
      true,
    );
  }

  it('preserves unrelated additions, edits, and deletions when selecting Google sign-in', () => {
    const startup: Settings = {
      model: { name: 'old-model' },
      ui: { theme: 'old-theme' },
      security: { auth: { selectedType: AuthType.USE_GEMINI } },
    };
    writeSettings(startup);
    const loaded = settingsAtStartup(startup);
    const edited: Settings = {
      ui: { theme: 'new-theme' },
      mcpServers: { added: { command: 'new-server' } },
      security: {
        auth: { selectedType: AuthType.USE_GEMINI, useExternal: true },
        folderTrust: { enabled: true },
      },
    };
    writeSettings(edited);

    loaded.setValue(
      SettingScope.User,
      'security.auth.selectedType',
      AuthType.LOGIN_WITH_GOOGLE,
    );

    expect(readSettings()).toEqual({
      ...edited,
      security: {
        ...edited.security,
        auth: {
          ...edited.security?.auth,
          selectedType: AuthType.LOGIN_WITH_GOOGLE,
        },
      },
    });
  });

  it('preserves disjoint writes made by two settings instances', () => {
    const startup: Settings = {
      ui: { theme: 'old-theme' },
      security: { auth: { selectedType: AuthType.LOGIN_WITH_GOOGLE } },
    };
    writeSettings(startup);
    const first = settingsAtStartup(startup);
    const second = settingsAtStartup(startup);

    first.setValue(SettingScope.User, 'ui.theme', 'new-theme');
    second.setValue(
      SettingScope.User,
      'security.auth.selectedType',
      AuthType.USE_GEMINI,
    );
    first.setValue(SettingScope.User, 'model.name', 'new-model');

    expect(readSettings()).toEqual({
      ui: { theme: 'new-theme' },
      model: { name: 'new-model' },
      security: { auth: { selectedType: AuthType.USE_GEMINI } },
    });
  });

  it('preserves unrelated arrays at every nesting level', () => {
    const startup: Settings = {
      context: {
        fileName: ['GEMINI.md', 'TEAM.md'],
        includeDirectories: ['src'],
      },
      mcpServers: {
        example: { command: 'node', args: ['server.js', '--safe'] },
      },
      security: { auth: { selectedType: AuthType.LOGIN_WITH_GOOGLE } },
    };
    writeSettings(startup);
    const loaded = settingsAtStartup(startup);

    loaded.setValue(
      SettingScope.User,
      'security.auth.selectedType',
      AuthType.LOGIN_WITH_GOOGLE,
    );
    loaded.setValue(
      SettingScope.User,
      'mcpServers.example.command',
      'new-node',
    );

    expect(readSettings()).toEqual({
      ...startup,
      mcpServers: {
        example: { command: 'new-node', args: ['server.js', '--safe'] },
      },
    });
  });

  it('persists indexed array paths without changing other array entries', () => {
    const startup: Settings = {
      context: { fileName: ['GEMINI.md', 'TEAM.md'] },
    };
    writeSettings(startup);
    const loaded = settingsAtStartup(startup);
    writeSettings({ context: { fileName: ['GEMINI.md', 'NEW-TEAM.md'] } });

    loaded.setValue(SettingScope.User, 'context.fileName.0', 'PROJECT.md');

    expect(readSettings()).toEqual({
      context: { fileName: ['PROJECT.md', 'NEW-TEAM.md'] },
    });
  });

  it('creates an array ancestor for an indexed path when the file is missing', () => {
    const loaded = settingsAtStartup({
      context: { fileName: ['GEMINI.md'] },
    });

    loaded.setValue(SettingScope.User, 'context.fileName.0', 'PROJECT.md');

    expect(readSettings()).toEqual({ context: { fileName: ['PROJECT.md'] } });
  });

  it('replaces an externally changed array ancestor when saving an object property', () => {
    const loaded = settingsAtStartup({
      security: {
        auth: { selectedType: AuthType.USE_GEMINI, useExternal: true },
      },
    });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        security: [],
        mcpServers: { external: { command: 'external-server' } },
      }),
    );

    loaded.setValue(
      SettingScope.User,
      'security.auth.selectedType',
      AuthType.LOGIN_WITH_GOOGLE,
    );

    expect(readSettings()).toEqual({
      security: { auth: { selectedType: AuthType.LOGIN_WITH_GOOGLE } },
      mcpServers: { external: { command: 'external-server' } },
    });
  });

  it('replaces an externally changed object ancestor when saving an array entry', () => {
    const loaded = settingsAtStartup({
      context: { fileName: ['GEMINI.md', 'TEAM.md'] },
    });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        context: {
          fileName: { 0: 'EXTERNAL.md' },
          includeDirectories: ['external-src'],
        },
      }),
    );

    loaded.setValue(SettingScope.User, 'context.fileName.0', 'PROJECT.md');

    expect(readSettings()).toEqual({
      context: {
        fileName: ['PROJECT.md'],
        includeDirectories: ['external-src'],
      },
    });
  });

  it('deletes only the selected auth property when signing out', () => {
    const startup: Settings = {
      security: { auth: { selectedType: AuthType.LOGIN_WITH_GOOGLE } },
    };
    writeSettings(startup);
    const loaded = settingsAtStartup(startup);
    writeSettings({
      security: {
        auth: { selectedType: AuthType.LOGIN_WITH_GOOGLE, useExternal: true },
        folderTrust: { enabled: true },
      },
    });

    loaded.setValue(SettingScope.User, 'security.auth.selectedType', undefined);

    expect(readSettings()).toEqual({
      security: {
        auth: { useExternal: true },
        folderTrust: { enabled: true },
      },
    });
  });

  it('replaces explicitly assigned objects while preserving unrelated settings', () => {
    const startup: Settings = {
      ui: { theme: 'old-theme', showMemoryUsage: true },
    };
    writeSettings(startup);
    const loaded = settingsAtStartup(startup);
    writeSettings({ ...startup, model: { name: 'external-model' } });

    loaded.setValue(SettingScope.User, 'ui', { theme: 'new-theme' });

    expect(readSettings()).toEqual({
      ui: { theme: 'new-theme' },
      model: { name: 'external-model' },
    });
  });

  it('preserves comments and raw environment placeholders in unrelated settings', () => {
    const startup: Settings = {
      mcpServers: {
        example: { command: 'example', env: { TOKEN: '${TEST_SECRET}' } },
      },
    };
    fs.writeFileSync(
      settingsPath,
      `{
        // Keep this server configuration.
        "mcpServers": {
          "example": {
            "command": "example",
            "env": { "TOKEN": "\${TEST_SECRET}" }
          }
        }
      }`,
    );
    const loaded = settingsAtStartup(startup);
    loaded.user.settings.mcpServers!['example'].env!['TOKEN'] =
      'expanded-secret';

    loaded.setValue(
      SettingScope.User,
      'security.auth.selectedType',
      AuthType.LOGIN_WITH_GOOGLE,
    );

    const content = fs.readFileSync(settingsPath, 'utf8');
    expect(content).toContain('// Keep this server configuration.');
    expect(content).toContain('${TEST_SECRET}');
    expect(content).not.toContain('expanded-secret');
    expect(readSettings()).toMatchObject(startup);
  });

  it.each([
    '{ "ui": { "theme": "unfinished"',
    '[]',
    'null',
    '42',
    'true',
    '"x"',
  ])(
    'does not overwrite an invalid settings object after startup: %s',
    (malformed) => {
      const loaded = settingsAtStartup({ ui: { theme: 'old-theme' } });
      fs.writeFileSync(settingsPath, malformed);
      const feedback = vi.spyOn(coreEvents, 'emitFeedback');

      loaded.setValue(
        SettingScope.User,
        'security.auth.selectedType',
        AuthType.LOGIN_WITH_GOOGLE,
      );

      expect(fs.readFileSync(settingsPath, 'utf8')).toBe(malformed);
      expect(feedback).toHaveBeenCalledWith(
        'error',
        'Error parsing settings file. Please check the JSON syntax.',
        expect.any(Error),
      );
    },
  );

  it('creates a new file with the selected auth property', () => {
    const loaded = settingsAtStartup({});
    loaded.setValue(
      SettingScope.User,
      'security.auth.selectedType',
      AuthType.LOGIN_WITH_GOOGLE,
    );
    expect(readSettings()).toEqual({
      security: { auth: { selectedType: AuthType.LOGIN_WITH_GOOGLE } },
    });
  });

  it('does not restore a stale snapshot if the file was deleted after startup', () => {
    const loaded = settingsAtStartup({ ui: { theme: 'deleted-setting' } });
    loaded.setValue(
      SettingScope.User,
      'security.auth.selectedType',
      AuthType.LOGIN_WITH_GOOGLE,
    );
    expect(readSettings()).toEqual({
      security: { auth: { selectedType: AuthType.LOGIN_WITH_GOOGLE } },
    });
  });

  it('retains full replacement semantics for an explicit saveSettings call', () => {
    const loaded = settingsAtStartup({ ui: { theme: 'saved-theme' } });
    writeSettings({
      ui: { theme: 'external-theme' },
      model: { name: 'removed' },
    });

    saveSettings(loaded.user);

    expect(readSettings()).toEqual({ ui: { theme: 'saved-theme' } });
  });
});
