/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { OpenFilesManager, MAX_FILES } from './open-files-manager.js';

const { vscodeMock: baseVscodeMock, createMockTextEditor } = await vi.hoisted(
  () => import('./utils/vscode-mock.js'),
);

let onDidChangeActiveTextEditorListener: (
  editor: vscode.TextEditor | undefined,
) => void;
let onDidChangeTextEditorSelectionListener: (
  e: vscode.TextEditorSelectionChangeEvent,
) => void;
let onDidDeleteFilesListener: (e: vscode.FileDeleteEvent) => void;
let onDidCloseTextDocumentListener: (doc: vscode.TextDocument) => void;
let onDidRenameFilesListener: (e: vscode.FileRenameEvent) => void;

vi.mock('vscode', () => ({
  ...baseVscodeMock,
  window: {
    ...baseVscodeMock.window,
    onDidChangeActiveTextEditor: vi.fn((listener) => {
      onDidChangeActiveTextEditorListener = listener;
      return { dispose: vi.fn() };
    }),
    onDidChangeTextEditorSelection: vi.fn((listener) => {
      onDidChangeTextEditorSelectionListener = listener;
      return { dispose: vi.fn() };
    }),
  },
  workspace: {
    ...baseVscodeMock.workspace,
    onDidDeleteFiles: vi.fn((listener) => {
      onDidDeleteFilesListener = listener;
      return { dispose: vi.fn() };
    }),
    onDidCloseTextDocument: vi.fn((listener) => {
      onDidCloseTextDocumentListener = listener;
      return { dispose: vi.fn() };
    }),
    onDidRenameFiles: vi.fn((listener) => {
      onDidRenameFilesListener = listener;
      return { dispose: vi.fn() };
    }),
  },
}));

describe('OpenFilesManager', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    vi.useFakeTimers();

    context = {
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const getUri = (path: string) => vscode.Uri.file(path);

  const addFile = (uri: vscode.Uri) => {
    onDidChangeActiveTextEditorListener(createMockTextEditor(uri));
  };

  it('adds a file to the list', async () => {
    const manager = new OpenFilesManager(context);
    const uri = getUri('/test/file1.txt');
    addFile(uri);
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.state.workspaceState!.openFiles).toHaveLength(1);
    expect(manager.state.workspaceState!.openFiles![0].path).toBe(
      '/test/file1.txt',
    );
  });

  it('moves an existing file to the top', async () => {
    const manager = new OpenFilesManager(context);
    const uri1 = getUri('/test/file1.txt');
    const uri2 = getUri('/test/file2.txt');
    addFile(uri1);
    addFile(uri2);
    addFile(uri1);
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.state.workspaceState!.openFiles).toHaveLength(2);
    expect(manager.state.workspaceState!.openFiles![0].path).toBe(
      '/test/file1.txt',
    );
  });

  it('does not exceed the max number of files', async () => {
    const manager = new OpenFilesManager(context);
    for (let i = 0; i < MAX_FILES + 5; i++) {
      const uri = getUri(`/test/file${i}.txt`);
      addFile(uri);
    }
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.state.workspaceState!.openFiles).toHaveLength(MAX_FILES);
    expect(manager.state.workspaceState!.openFiles![0].path).toBe(
      `/test/file${MAX_FILES + 4}.txt`,
    );
    expect(manager.state.workspaceState!.openFiles![MAX_FILES - 1].path).toBe(
      `/test/file5.txt`,
    );
  });

  it('fires onDidChange when a file is added', async () => {
    const manager = new OpenFilesManager(context);
    const onDidChangeSpy = vi.fn();
    manager.onDidChange(onDidChangeSpy);

    const uri = getUri('/test/file1.txt');
    addFile(uri);

    await vi.advanceTimersByTimeAsync(100);
    expect(onDidChangeSpy).toHaveBeenCalled();
  });

  it('removes a file when it is closed', async () => {
    const manager = new OpenFilesManager(context);
    const uri = getUri('/test/file1.txt');
    addFile(uri);
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.state.workspaceState!.openFiles).toHaveLength(1);

    onDidCloseTextDocumentListener({ uri } as vscode.TextDocument);
    await vi.advanceTimersByTimeAsync(100);

    expect(manager.state.workspaceState!.openFiles).toHaveLength(0);
  });

  it('fires onDidChange when a file is removed', async () => {
    const manager = new OpenFilesManager(context);
    const uri = getUri('/test/file1.txt');
    addFile(uri);
    await vi.advanceTimersByTimeAsync(100);

    const onDidChangeSpy = vi.fn();
    manager.onDidChange(onDidChangeSpy);

    onDidCloseTextDocumentListener({ uri } as vscode.TextDocument);
    await vi.advanceTimersByTimeAsync(100);

    expect(onDidChangeSpy).toHaveBeenCalled();
  });

  it('removes a file when it is deleted', async () => {
    const manager = new OpenFilesManager(context);
    const uri1 = getUri('/test/file1.txt');
    const uri2 = getUri('/test/file2.txt');
    addFile(uri1);
    addFile(uri2);
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.state.workspaceState!.openFiles).toHaveLength(2);

    onDidDeleteFilesListener({ files: [uri1] } as vscode.FileDeleteEvent);
    await vi.advanceTimersByTimeAsync(100);

    expect(manager.state.workspaceState!.openFiles).toHaveLength(1);
    expect(manager.state.workspaceState!.openFiles![0].path).toBe(
      '/test/file2.txt',
    );
  });

  it('fires onDidChange when a file is deleted', async () => {
    const manager = new OpenFilesManager(context);
    const uri = getUri('/test/file1.txt');
    addFile(uri);
    await vi.advanceTimersByTimeAsync(100);

    const onDidChangeSpy = vi.fn();
    manager.onDidChange(onDidChangeSpy);

    onDidDeleteFilesListener({ files: [uri] } as vscode.FileDeleteEvent);
    await vi.advanceTimersByTimeAsync(100);

    expect(onDidChangeSpy).toHaveBeenCalled();
  });

  it('removes multiple files when they are deleted', async () => {
    const manager = new OpenFilesManager(context);
    const uri1 = getUri('/test/file1.txt');
    const uri2 = getUri('/test/file2.txt');
    const uri3 = getUri('/test/file3.txt');
    addFile(uri1);
    addFile(uri2);
    addFile(uri3);
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.state.workspaceState!.openFiles).toHaveLength(3);

    onDidDeleteFilesListener({ files: [uri1, uri3] } as vscode.FileDeleteEvent);
    await vi.advanceTimersByTimeAsync(100);

    expect(manager.state.workspaceState!.openFiles).toHaveLength(1);
    expect(manager.state.workspaceState!.openFiles![0].path).toBe(
      '/test/file2.txt',
    );
  });

  it('fires onDidChange only once when adding an existing file', async () => {
    const manager = new OpenFilesManager(context);
    const uri = getUri('/test/file1.txt');
    addFile(uri);
    await vi.advanceTimersByTimeAsync(100);

    const onDidChangeSpy = vi.fn();
    manager.onDidChange(onDidChangeSpy);

    addFile(uri);
    await vi.advanceTimersByTimeAsync(100);
    expect(onDidChangeSpy).toHaveBeenCalledTimes(1);
  });

  it('updates the file when it is renamed', async () => {
    const manager = new OpenFilesManager(context);
    const oldUri = getUri('/test/file1.txt');
    const newUri = getUri('/test/file2.txt');
    addFile(oldUri);
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.state.workspaceState!.openFiles).toHaveLength(1);
    expect(manager.state.workspaceState!.openFiles![0].path).toBe(
      '/test/file1.txt',
    );

    onDidRenameFilesListener({
      files: [{ oldUri, newUri }],
    } as vscode.FileRenameEvent);
    await vi.advanceTimersByTimeAsync(100);

    expect(manager.state.workspaceState!.openFiles).toHaveLength(1);
    expect(manager.state.workspaceState!.openFiles![0].path).toBe(
      '/test/file2.txt',
    );
  });

  it('adds a file when the active editor changes', async () => {
    const manager = new OpenFilesManager(context);
    const uri = getUri('/test/file1.txt');

    addFile(uri);
    await vi.advanceTimersByTimeAsync(100);

    expect(manager.state.workspaceState!.openFiles).toHaveLength(1);
    expect(manager.state.workspaceState!.openFiles![0].path).toBe(
      '/test/file1.txt',
    );
  });

  it('updates the cursor position on selection change', async () => {
    const manager = new OpenFilesManager(context);
    const uri = getUri('/test/file1.txt');
    addFile(uri);
    await vi.advanceTimersByTimeAsync(100);

    const selection = {
      active: { line: 10, character: 20 },
    } as vscode.Selection;

    const editor = createMockTextEditor(uri) as vscode.TextEditor;
    editor.selection = selection;

    onDidChangeTextEditorSelectionListener({
      textEditor: editor,
      selections: [selection],
      kind: vscode.TextEditorSelectionChangeKind.Mouse,
    });

    await vi.advanceTimersByTimeAsync(100);

    const file = manager.state.workspaceState!.openFiles![0];
    expect(file.cursor).toEqual({ line: 11, character: 21 });
  });

  it('updates the selected text on selection change', async () => {
    const manager = new OpenFilesManager(context);
    const uri = getUri('/test/file1.txt');
    const selection = {
      active: { line: 10, character: 20 },
    } as vscode.Selection;

    const editor = createMockTextEditor(
      uri,
      'selected text',
    ) as vscode.TextEditor;
    editor.selection = selection;

    addFile(uri);
    await vi.advanceTimersByTimeAsync(100);

    onDidChangeTextEditorSelectionListener({
      textEditor: editor,
      selections: [selection],
      kind: vscode.TextEditorSelectionChangeKind.Mouse,
    });

    await vi.advanceTimersByTimeAsync(100);

    const file = manager.state.workspaceState!.openFiles![0];
    expect(file.selectedText).toBe('selected text');
    expect(editor.document.getText).toHaveBeenCalledWith(selection);
  });

  it('truncates long selected text', async () => {
    const manager = new OpenFilesManager(context);
    const uri = getUri('/test/file1.txt');
    const longText = 'a'.repeat(20000);
    const truncatedText = longText.substring(0, 16384);

    const selection = {
      active: { line: 10, character: 20 },
    } as vscode.Selection;

    const editor = createMockTextEditor(uri, longText) as vscode.TextEditor;
    editor.selection = selection;

    addFile(uri);
    await vi.advanceTimersByTimeAsync(100);

    onDidChangeTextEditorSelectionListener({
      textEditor: editor,
      selections: [selection],
      kind: vscode.TextEditorSelectionChangeKind.Mouse,
    });

    await vi.advanceTimersByTimeAsync(100);

    const file = manager.state.workspaceState!.openFiles![0];
    expect(file.selectedText).toBe(truncatedText);
  });

  it('deactivates the previously active file', async () => {
    const manager = new OpenFilesManager(context);
    const uri1 = getUri('/test/file1.txt');
    const uri2 = getUri('/test/file2.txt');

    addFile(uri1);
    await vi.advanceTimersByTimeAsync(100);

    const selection = {
      active: { line: 10, character: 20 },
    } as vscode.Selection;

    const editor = createMockTextEditor(uri1) as vscode.TextEditor;
    editor.selection = selection;

    onDidChangeTextEditorSelectionListener({
      textEditor: editor,
      selections: [selection],
      kind: vscode.TextEditorSelectionChangeKind.Mouse,
    });
    await vi.advanceTimersByTimeAsync(100);

    let file1 = manager.state.workspaceState!.openFiles![0];
    expect(file1.isActive).toBe(true);
    expect(file1.cursor).toBeDefined();

    addFile(uri2);
    await vi.advanceTimersByTimeAsync(100);

    file1 = manager.state.workspaceState!.openFiles!.find(
      (f) => f.path === '/test/file1.txt',
    )!;
    const file2 = manager.state.workspaceState!.openFiles![0];

    expect(file1.isActive).toBe(false);
    expect(file1.cursor).toBeUndefined();
    expect(file1.selectedText).toBeUndefined();
    expect(file2.path).toBe('/test/file2.txt');
    expect(file2.isActive).toBe(true);
  });

  it('ignores non-file URIs', async () => {
    const manager = new OpenFilesManager(context);
    const uri = {
      fsPath: '/test/file1.txt',
      scheme: 'untitled',
    } as vscode.Uri;

    addFile(uri);
    await vi.advanceTimersByTimeAsync(100);

    expect(manager.state.workspaceState!.openFiles).toHaveLength(0);
  });
});
