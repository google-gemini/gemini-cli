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
  EventEmitter: vi.fn(() => {
    const listeners: Array<(e: void) => unknown> = [];
    return {
      event: vi.fn((listener) => {
        listeners.push(listener);
        return { dispose: vi.fn() };
      }),
      fire: vi.fn(() => {
        listeners.forEach((listener) => listener(undefined));
      }),
      dispose: vi.fn(),
    };
  }),
  window: {
    onDidChangeActiveTextEditor: vi.fn(),
    onDidChangeTextEditorSelection: vi.fn(),
  },
  workspace: {
    onDidDeleteFiles: vi.fn(),
    onDidCloseTextDocument: vi.fn(),
    onDidRenameFiles: vi.fn(),
  },
  Uri: {
    file: (path: string) => ({
      fsPath: path,
      scheme: 'file',
    }),
  },
}));

describe('RecentFilesManager', () => {
  let context: vscode.ExtensionContext;
  let onDidChangeActiveTextEditorListener: (
    editor: vscode.TextEditor | undefined,
  ) => void;
  let onDidDeleteFilesListener: (e: vscode.FileDeleteEvent) => void;
  let onDidCloseTextDocumentListener: (doc: vscode.TextDocument) => void;
  let onDidRenameFilesListener: (e: vscode.FileRenameEvent) => void;

  beforeEach(() => {
    vi.useFakeTimers();

    vi.mocked(vscode.window.onDidChangeActiveTextEditor).mockImplementation(
      (listener) => {
        onDidChangeActiveTextEditorListener = listener;
        return { dispose: vi.fn() };
      },
    );
    vi.mocked(vscode.workspace.onDidDeleteFiles).mockImplementation(
      (listener) => {
        onDidDeleteFilesListener = listener;
        return { dispose: vi.fn() };
      },
    );
    vi.mocked(vscode.workspace.onDidCloseTextDocument).mockImplementation(
      (listener) => {
        onDidCloseTextDocumentListener = listener;
        return { dispose: vi.fn() };
      },
    );
    vi.mocked(vscode.workspace.onDidRenameFiles).mockImplementation(
      (listener) => {
        onDidRenameFilesListener = listener;
        return { dispose: vi.fn() };
      },
    );

    context = {
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const getUri = (path: string) =>
    vscode.Uri.file(path) as unknown as vscode.Uri;

  it('adds a file to the list', async () => {
    const manager = new RecentFilesManager(context);
    const uri = getUri('/test/file1.txt');
    manager.add(uri);
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.recentFiles).toHaveLength(1);
    expect(manager.recentFiles[0].filePath).toBe('/test/file1.txt');
  });

  it('moves an existing file to the top', async () => {
    const manager = new RecentFilesManager(context);
    const uri1 = getUri('/test/file1.txt');
    const uri2 = getUri('/test/file2.txt');
    manager.add(uri1);
    manager.add(uri2);
    manager.add(uri1);
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.recentFiles).toHaveLength(2);
    expect(manager.recentFiles[0].filePath).toBe('/test/file1.txt');
  });

  it('does not exceed the max number of files', async () => {
    const manager = new RecentFilesManager(context);
    for (let i = 0; i < MAX_FILES + 5; i++) {
      const uri = getUri(`/test/file${i}.txt`);
      manager.add(uri);
    }
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.recentFiles).toHaveLength(MAX_FILES);
    expect(manager.recentFiles[0].filePath).toBe(
      `/test/file${MAX_FILES + 4}.txt`,
    );
    expect(manager.recentFiles[MAX_FILES - 1].filePath).toBe(`/test/file5.txt`);
  });

  it('fires onDidChange when a file is added', async () => {
    const manager = new RecentFilesManager(context);
    const onDidChangeSpy = vi.fn();
    manager.onDidChange(onDidChangeSpy);

    const uri = getUri('/test/file1.txt');
    manager.add(uri);

    await vi.advanceTimersByTimeAsync(100);
    expect(onDidChangeSpy).toHaveBeenCalled();
  });

  it('removes a file when it is closed', async () => {
    const manager = new RecentFilesManager(context);
    const uri = getUri('/test/file1.txt');
    manager.add(uri);
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.recentFiles).toHaveLength(1);

    onDidCloseTextDocumentListener({ uri } as vscode.TextDocument);
    await vi.advanceTimersByTimeAsync(100);

    expect(manager.recentFiles).toHaveLength(0);
  });

  it('fires onDidChange when a file is removed', async () => {
    const manager = new RecentFilesManager(context);
    const uri = getUri('/test/file1.txt');
    manager.add(uri);
    await vi.advanceTimersByTimeAsync(100);

    const onDidChangeSpy = vi.fn();
    manager.onDidChange(onDidChangeSpy);

    onDidCloseTextDocumentListener({ uri } as vscode.TextDocument);
    await vi.advanceTimersByTimeAsync(100);

    expect(onDidChangeSpy).toHaveBeenCalled();
  });

  it('removes a file when it is deleted', async () => {
    const manager = new RecentFilesManager(context);
    const uri1 = getUri('/test/file1.txt');
    const uri2 = getUri('/test/file2.txt');
    manager.add(uri1);
    manager.add(uri2);
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.recentFiles).toHaveLength(2);

    onDidDeleteFilesListener({ files: [uri1] });
    await vi.advanceTimersByTimeAsync(100);

    expect(manager.recentFiles).toHaveLength(1);
    expect(manager.recentFiles[0].filePath).toBe('/test/file2.txt');
  });

  it('fires onDidChange when a file is deleted', async () => {
    const manager = new RecentFilesManager(context);
    const uri = getUri('/test/file1.txt');
    manager.add(uri);
    await vi.advanceTimersByTimeAsync(100);

    const onDidChangeSpy = vi.fn();
    manager.onDidChange(onDidChangeSpy);

    onDidDeleteFilesListener({ files: [uri] });
    await vi.advanceTimersByTimeAsync(100);

    expect(onDidChangeSpy).toHaveBeenCalled();
  });

  it('removes multiple files when they are deleted', async () => {
    const manager = new RecentFilesManager(context);
    const uri1 = getUri('/test/file1.txt');
    const uri2 = getUri('/test/file2.txt');
    const uri3 = getUri('/test/file3.txt');
    manager.add(uri1);
    manager.add(uri2);
    manager.add(uri3);
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.recentFiles).toHaveLength(3);

    onDidDeleteFilesListener({ files: [uri1, uri3] });
    await vi.advanceTimersByTimeAsync(100);

    expect(manager.recentFiles).toHaveLength(1);
    expect(manager.recentFiles[0].filePath).toBe('/test/file2.txt');
  });

  it('prunes files older than the max age', () => {
    const manager = new RecentFilesManager(context);
    const uri1 = getUri('/test/file1.txt');
    manager.add(uri1);

    // Advance time by more than the max age
    const twoMinutesMs = (MAX_FILE_AGE_MINUTES + 1) * 60 * 1000;
    vi.advanceTimersByTime(twoMinutesMs);

    const uri2 = getUri('/test/file2.txt');
    manager.add(uri2);

    expect(manager.recentFiles).toHaveLength(1);
    expect(manager.recentFiles[0].filePath).toBe('/test/file2.txt');
  });

  it('fires onDidChange only once when adding an existing file', async () => {
    const manager = new RecentFilesManager(context);
    const uri = getUri('/test/file1.txt');
    manager.add(uri);
    await vi.advanceTimersByTimeAsync(100);

    const onDidChangeSpy = vi.fn();
    manager.onDidChange(onDidChangeSpy);

    manager.add(uri);
    await vi.advanceTimersByTimeAsync(100);
    expect(onDidChangeSpy).toHaveBeenCalledTimes(1);
  });

  it('updates the file when it is renamed', async () => {
    const manager = new RecentFilesManager(context);
    const oldUri = getUri('/test/file1.txt');
    const newUri = getUri('/test/file2.txt');
    manager.add(oldUri);
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.recentFiles).toHaveLength(1);
    expect(manager.recentFiles[0].filePath).toBe('/test/file1.txt');

    onDidRenameFilesListener({ files: [{ oldUri, newUri }] });
    await vi.advanceTimersByTimeAsync(100);

    expect(manager.recentFiles).toHaveLength(1);
    expect(manager.recentFiles[0].filePath).toBe('/test/file2.txt');
  });

  it('adds a file when the active editor changes', async () => {
    const manager = new RecentFilesManager(context);
    const uri = getUri('/test/file1.txt');

    onDidChangeActiveTextEditorListener({
      document: { uri },
    } as vscode.TextEditor);
    await vi.advanceTimersByTimeAsync(100);

    expect(manager.recentFiles).toHaveLength(1);
    expect(manager.recentFiles[0].filePath).toBe('/test/file1.txt');
  });
});
