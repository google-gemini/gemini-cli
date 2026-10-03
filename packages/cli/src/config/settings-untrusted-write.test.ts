/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coreEvents } from '@google/gemini-cli-core';

import { LoadedSettings, SettingScope } from './settings.js';

/**
 * An untrusted workspace is replaced by an emptied copy of its settings file.
 * That copy keeps the real `path`, so persisting it writes `{}` plus whatever
 * was just set over the user's file -- and `applyKeyDiff` is sync-by-omission,
 * so every other key on disk is deleted.
 *
 * Real files, no fs mocks: the whole point is what ends up on disk.
 */
describe('settings writes in an untrusted workspace', () => {
  const ORIGINAL = JSON.stringify(
    {
      ui: { theme: 'GitHub' },
      context: { fileName: 'GEMINI.md' },
      mcpServers: { existing: { command: 'echo' } },
    },
    null,
    2,
  );

  let tmpDir: string;
  let workspaceSettingsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-untrusted-'));
    workspaceSettingsPath = path.join(tmpDir, 'settings.json');
    fs.writeFileSync(workspaceSettingsPath, ORIGINAL, 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const emptyFile = () => ({ path: '', settings: {}, originalSettings: {} });

  const load = (isTrusted: boolean) =>
    new LoadedSettings(
      emptyFile(),
      emptyFile(),
      { ...emptyFile(), path: path.join(tmpDir, 'user-settings.json') },
      {
        path: workspaceSettingsPath,
        settings: {
          ui: { theme: 'GitHub' },
          context: { fileName: 'GEMINI.md' },
          mcpServers: { existing: { command: 'echo' } },
        },
        originalSettings: {
          ui: { theme: 'GitHub' },
          context: { fileName: 'GEMINI.md' },
          mcpServers: { existing: { command: 'echo' } },
        },
      },
      isTrusted,
      [],
    );

  it('marks the emptied workspace read-only so it is never persisted', () => {
    expect(load(false).workspace.readOnly).toBe(true);
  });

  it('leaves the settings file byte-identical', () => {
    load(false).setValue(SettingScope.Workspace, 'mcpServers', {
      newsrv: { command: 'echo' },
    });

    expect(fs.readFileSync(workspaceSettingsPath, 'utf-8')).toBe(ORIGINAL);
  });

  it('does not drop unrelated keys or the existing server', () => {
    load(false).setValue(SettingScope.Workspace, 'mcpServers', {
      newsrv: { command: 'echo' },
    });

    const onDisk = JSON.parse(
      fs.readFileSync(workspaceSettingsPath, 'utf-8'),
    ) as Record<string, unknown>;

    expect(Object.keys(onDisk).sort()).toEqual(['context', 'mcpServers', 'ui']);
    expect(onDisk['mcpServers']).toHaveProperty('existing');
  });

  it('still persists, and merges, when the workspace is trusted', () => {
    load(true).setValue(SettingScope.Workspace, 'mcpServers', {
      existing: { command: 'echo' },
      newsrv: { command: 'echo' },
    });

    const onDisk = JSON.parse(
      fs.readFileSync(workspaceSettingsPath, 'utf-8'),
    ) as Record<string, unknown>;

    expect(onDisk['ui']).toEqual({ theme: 'GitHub' });
    expect(onDisk['mcpServers']).toHaveProperty('existing');
    expect(onDisk['mcpServers']).toHaveProperty('newsrv');
  });

  it('warns that nothing was saved, so callers cannot report false success', () => {
    const emitFeedback = vi
      .spyOn(coreEvents, 'emitFeedback')
      .mockImplementation(() => {});

    load(false).setValue(SettingScope.Workspace, 'mcpServers', {
      newsrv: { command: 'echo' },
    });

    expect(emitFeedback).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('not trusted'),
    );
    emitFeedback.mockRestore();
  });

  it('does not warn when the write actually lands', () => {
    const emitFeedback = vi
      .spyOn(coreEvents, 'emitFeedback')
      .mockImplementation(() => {});

    load(true).setValue(SettingScope.Workspace, 'mcpServers', {
      newsrv: { command: 'echo' },
    });

    expect(emitFeedback).not.toHaveBeenCalled();
    emitFeedback.mockRestore();
  });
});
