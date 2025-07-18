/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { RecentFilesManager } from './recent-files-manager.js';

vi.mock('vscode', () => ({
  EventEmitter: vi.fn(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
  window: {
    onDidChangeActiveTextEditor: vi.fn(),
  },
  workspace: {
    onDidDeleteFiles: vi.fn(),
    onDidCloseTextDocument: vi.fn(),
  },
  Uri: {
    file: (path: string) => ({
      fsPath: path,
    }),
  },
}));

describe('RecentFilesManager', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    context = {
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds a file to the list', () => {
    const manager = new RecentFilesManager(context);
    const uri = vscode.Uri.file('/test/file1.txt');
    manager.add(uri);
    expect(manager.recentFiles).toHaveLength(1);
    expect(manager.recentFiles[0].filePath).toBe('/test/file1.txt');
  });

  it('moves an existing file to the top', () => {
    const manager = new RecentFilesManager(context);
    const uri1 = vscode.Uri.file('/test/file1.txt');
    const uri2 = vscode.Uri.file('/test/file2.txt');
    manager.add(uri1);
    manager.add(uri2);
    manager.add(uri1);
    expect(manager.recentFiles).toHaveLength(2);
    expect(manager.recentFiles[0].filePath).toBe('/test/file1.txt');
  });

  it('does not exceed the max number of files', () => {
    const manager = new RecentFilesManager(context, 2);
    const uri1 = vscode.Uri.file('/test/file1.txt');
    const uri2 = vscode.Uri.file('/test/file2.txt');
    const uri3 = vscode.Uri.file('/test/file3.txt');
    manager.add(uri1);
    manager.add(uri2);
    manager.add(uri3);
    expect(manager.recentFiles).toHaveLength(2);
    expect(manager.recentFiles[0].filePath).toBe('/test/file3.txt');
    expect(manager.recentFiles[1].filePath).toBe('/test/file2.txt');
  });

  it('fires onDidChange when a file is added', () => {
    const manager = new RecentFilesManager(context);
    const spy = vi.spyOn(manager['onDidChangeEmitter'], 'fire');
    const uri = vscode.Uri.file('/test/file1.txt');
    manager.add(uri);
    expect(spy).toHaveBeenCalled();
  });

  it('removes a file when it is closed', () => {
    const manager = new RecentFilesManager(context);
    const uri = vscode.Uri.file('/test/file1.txt');
    manager.add(uri);
    expect(manager.recentFiles).toHaveLength(1);

    // Simulate closing the file
    const closeHandler = vi.mocked(vscode.workspace.onDidCloseTextDocument).mock
      .calls[0][0];
    closeHandler({ uri } as vscode.TextDocument);

    expect(manager.recentFiles).toHaveLength(0);
  });

  it('fires onDidChange when a file is removed', () => {
    const manager = new RecentFilesManager(context);
    const uri = vscode.Uri.file('/test/file1.txt');
    manager.add(uri);

    const spy = vi.spyOn(manager['onDidChangeEmitter'], 'fire');
    const closeHandler = vi.mocked(vscode.workspace.onDidCloseTextDocument).mock
      .calls[0][0];
    closeHandler({ uri } as vscode.TextDocument);

    expect(spy).toHaveBeenCalled();
  });

  it('removes a file when it is deleted', () => {
    const manager = new RecentFilesManager(context);
    const uri1 = vscode.Uri.file('/test/file1.txt');
    const uri2 = vscode.Uri.file('/test/file2.txt');
    manager.add(uri1);
    manager.add(uri2);
    expect(manager.recentFiles).toHaveLength(2);

    // Simulate deleting a file
    const deleteHandler = vi.mocked(vscode.workspace.onDidDeleteFiles).mock
      .calls[0][0];
    deleteHandler({ files: [uri1] });

    expect(manager.recentFiles).toHaveLength(1);
    expect(manager.recentFiles[0].filePath).toBe('/test/file2.txt');
  });

  it('fires onDidChange when a file is deleted', () => {
    const manager = new RecentFilesManager(context);
    const uri = vscode.Uri.file('/test/file1.txt');
    manager.add(uri);

    const spy = vi.spyOn(manager['onDidChangeEmitter'], 'fire');
    const deleteHandler = vi.mocked(vscode.workspace.onDidDeleteFiles).mock
      .calls[0][0];
    deleteHandler({ files: [uri] });

    expect(spy).toHaveBeenCalled();
  });

  it('removes multiple files when they are deleted', () => {
    const manager = new RecentFilesManager(context);
    const uri1 = vscode.Uri.file('/test/file1.txt');
    const uri2 = vscode.Uri.file('/test/file2.txt');
    const uri3 = vscode.Uri.file('/test/file3.txt');
    manager.add(uri1);
    manager.add(uri2);
    manager.add(uri3);
    expect(manager.recentFiles).toHaveLength(3);

    // Simulate deleting multiple files
    const deleteHandler = vi.mocked(vscode.workspace.onDidDeleteFiles).mock
      .calls[0][0];
    deleteHandler({ files: [uri1, uri3] });

    expect(manager.recentFiles).toHaveLength(1);
    expect(manager.recentFiles[0].filePath).toBe('/test/file2.txt');
  });

  it('prunes files older than the max age', () => {
    const manager = new RecentFilesManager(context, 10, 1); // 1 minute max age
    const uri1 = vscode.Uri.file('/test/file1.txt');
    const uri2 = vscode.Uri.file('/test/file2.txt');

    // Add a file that is not expired
    manager.add(uri1);

    // Add a file that is expired
    const oldTimestamp = Date.now() - 2 * 60 * 1000; // 2 minutes ago
    manager['files'].push({ uri: uri2, timestamp: oldTimestamp });

    expect(manager.recentFiles).toHaveLength(1);
    expect(manager.recentFiles[0].filePath).toBe('/test/file1.txt');
  });

  describe('with MAX_RECENT_FILES from environment variable', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('uses the value from the environment variable', async () => {
      process.env['IDE_MODE_MAX_RECENT_FILES'] = '5';
      const { RecentFilesManager } = await import('./recent-files-manager.js');
      const manager = new RecentFilesManager(context);
      for (let i = 0; i < 10; i++) {
        manager.add(vscode.Uri.file(`/test/file${i}.txt`));
      }
      expect(manager.recentFiles).toHaveLength(5);
    });

    it('uses the default value if the environment variable is invalid', async () => {
      process.env['IDE_MODE_MAX_RECENT_FILES'] = 'not-a-number';
      const { RecentFilesManager, getMaxRecentFiles } = await import(
        './recent-files-manager.js'
      );
      expect(getMaxRecentFiles()).toBe(10);
      const manager = new RecentFilesManager(context);
      for (let i = 0; i < 20; i++) {
        manager.add(vscode.Uri.file(`/test/file${i}.txt`));
      }
      expect(manager.recentFiles).toHaveLength(10);
    });
  });

  describe('with MAX_FILE_AGE_MINUTES from environment variable', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('uses the value from the environment variable', async () => {
      process.env['IDE_MODE_MAX_FILE_AGE_MINUTES'] = '1';
      const { RecentFilesManager } = await import('./recent-files-manager.js');
      const manager = new RecentFilesManager(context);
      const uri1 = vscode.Uri.file('/test/file1.txt');
      const uri2 = vscode.Uri.file('/test/file2.txt');

      // Add a file that is not expired
      manager.add(uri1);

      // Add a file that is expired
      const oldTimestamp = Date.now() - 2 * 60 * 1000; // 2 minutes ago
      manager['files'].push({ uri: uri2, timestamp: oldTimestamp });

      expect(manager.recentFiles).toHaveLength(1);
      expect(manager.recentFiles[0].filePath).toBe('/test/file1.txt');
    });

    it('uses the default value if the environment variable is invalid', async () => {
      process.env['IDE_MODE_MAX_FILE_AGE_MINUTES'] = 'not-a-number';
      const { RecentFilesManager, getMaxFileAge } = await import(
        './recent-files-manager.js'
      );
      expect(getMaxFileAge()).toBe(10);
      const manager = new RecentFilesManager(context);
      const uri1 = vscode.Uri.file('/test/file1.txt');
      const uri2 = vscode.Uri.file('/test/file2.txt');

      // Add a file that is not expired
      manager.add(uri1);

      // Add a file that is expired
      const oldTimestamp = Date.now() - (20160 + 1) * 60 * 1000;
      manager['files'].push({ uri: uri2, timestamp: oldTimestamp });

      expect(manager.recentFiles).toHaveLength(1);
      expect(manager.recentFiles[0].filePath).toBe('/test/file1.txt');
    });
  });

  it('fires onDidChange only once when adding an existing file', () => {
    const manager = new RecentFilesManager(context);
    const uri = vscode.Uri.file('/test/file1.txt');
    manager.add(uri);

    const spy = vi.spyOn(manager['onDidChangeEmitter'], 'fire');
    manager.add(uri);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
