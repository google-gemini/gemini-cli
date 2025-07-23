/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  RecentFilesManager,
  MAX_FILES,
  MAX_FILE_AGE_MINUTES,
} from './recent-files-manager.js';

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
    onDidRenameFiles: vi.fn(),
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
    const manager = new RecentFilesManager(context);
    for (let i = 0; i < MAX_FILES + 5; i++) {
      const uri = vscode.Uri.file(`/test/file${i}.txt`);
      manager.add(uri);
    }
    expect(manager.recentFiles).toHaveLength(MAX_FILES);
    expect(manager.recentFiles[0].filePath).toBe(
      `/test/file${MAX_FILES + 4}.txt`,
    );
    expect(manager.recentFiles[MAX_FILES - 1].filePath).toBe(`/test/file5.txt`);
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
    vi.useFakeTimers();

    const manager = new RecentFilesManager(context);
    const uri1 = vscode.Uri.file('/test/file1.txt');
    manager.add(uri1);

    // Advance time by more than the max age
    const twoMinutesMs = (MAX_FILE_AGE_MINUTES + 1) * 60 * 1000;
    vi.advanceTimersByTime(twoMinutesMs);

    const uri2 = vscode.Uri.file('/test/file2.txt');
    manager.add(uri2);

    expect(manager.recentFiles).toHaveLength(1);
    expect(manager.recentFiles[0].filePath).toBe('/test/file2.txt');

    vi.useRealTimers();
  });

  it('fires onDidChange only once when adding an existing file', () => {
    const manager = new RecentFilesManager(context);
    const uri = vscode.Uri.file('/test/file1.txt');
    manager.add(uri);

    const spy = vi.spyOn(manager['onDidChangeEmitter'], 'fire');
    manager.add(uri);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('updates the file when it is renamed', () => {
    const manager = new RecentFilesManager(context);
    const oldUri = vscode.Uri.file('/test/file1.txt');
    const newUri = vscode.Uri.file('/test/file2.txt');
    manager.add(oldUri);
    expect(manager.recentFiles).toHaveLength(1);
    expect(manager.recentFiles[0].filePath).toBe('/test/file1.txt');

    // Simulate renaming the file
    const renameHandler = vi.mocked(vscode.workspace.onDidRenameFiles).mock
      .calls[0][0];
    renameHandler({ files: [{ oldUri, newUri }] });

    expect(manager.recentFiles).toHaveLength(1);
    expect(manager.recentFiles[0].filePath).toBe('/test/file2.txt');
  });
});
