/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import type * as vscode from 'vscode';

/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A mock implementation of vscode.Uri.
 */
export class MockUri {
  constructor(
    public scheme: string,
    public path: string,
    public query: string = '',
  ) {}

  toString() {
    const q = this.query ? `?${this.query}` : '';
    return `${this.scheme}://${this.path}${q}`;
  }

  get fsPath() {
    return this.path;
  }
}

/**
 * Creates a mock EventEmitter.
 */
export const createEventEmitter = () => {
  const listeners = new Set<(e: unknown) => unknown>();
  return {
    event: vi.fn((listener: (e: unknown) => unknown) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    }),
    fire: vi.fn((data: unknown) => {
      listeners.forEach((l) => l(data));
    }),
    dispose: vi.fn(),
  };
};

/**
 * The base mock object for the vscode module.
 * Properties that are frequently overridden in tests are typed as 'any'
 * to allow simple object assignment without verbose casting.
 */
export const vscodeMock = {
  window: {
    onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeTextEditorSelection: vi.fn(() => ({ dispose: vi.fn() })),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    activeTextEditor: undefined as any,
    tabGroups: {
      all: [] as any[],
      close: vi.fn(),
    },
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    })),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showTextDocument: vi.fn(),
    showWorkspaceFolderPick: vi.fn(),
    createTerminal: vi.fn(() => ({
      show: vi.fn(),
      sendText: vi.fn(),
    })),
  },
  workspace: {
    workspaceFolders: [] as any[],
    isTrusted: true,
    onDidCloseTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
    onDidDeleteFiles: vi.fn(() => ({ dispose: vi.fn() })),
    onDidRenameFiles: vi.fn(() => ({ dispose: vi.fn() })),
    registerTextDocumentContentProvider: vi.fn(),
    onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
    onDidGrantWorkspaceTrust: vi.fn(() => ({ dispose: vi.fn() })),
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
      update: vi.fn(),
    })),
    openTextDocument: vi.fn(),
    fs: {
      stat: vi.fn(),
    },
  },
  commands: {
    executeCommand: vi.fn(),
    registerCommand: vi.fn(),
  },
  Uri: {
    file: vi.fn(
      (path: string) => new MockUri('file', path) as unknown as vscode.Uri,
    ),
    from: vi.fn(
      (args: { scheme: string; path: string; query?: string }) =>
        new MockUri(
          args.scheme,
          args.path,
          args.query || '',
        ) as unknown as vscode.Uri,
    ),
    parse: vi.fn((uri: string) => {
      const [scheme, rest] = uri.split('://');
      const [path, query] = (rest || '').split('?');
      return new MockUri(scheme, path, query || '') as unknown as vscode.Uri;
    }),
    joinPath: vi.fn(
      (uri: vscode.Uri, ...parts: string[]) =>
        new MockUri(
          uri.scheme,
          [uri.fsPath, ...parts].join('/'),
          (uri as any).query || '',
        ) as unknown as vscode.Uri,
    ),
  },
  EventEmitter: vi.fn(
    () => createEventEmitter() as unknown as vscode.EventEmitter<any>,
  ),
  TabInputTextDiff: class {
    constructor(
      public original: vscode.Uri | null,
      public modified: vscode.Uri,
    ) {}
  },
  ExtensionMode: {
    Development: 1,
    Production: 2,
  },
  TextEditorSelectionChangeKind: {
    Mouse: 2,
  },
  extensions: {
    getExtension: vi.fn(),
  },
};

/**
 * Helper to create a mock TextDocument.
 */
export const createMockTextDocument = (
  uri: vscode.Uri,
  content: string = '',
): any => ({
  uri,
  getText: vi.fn().mockReturnValue(content),
  fileName: uri.fsPath,
});

/**
 * Helper to create a mock TextEditor.
 */
export const createMockTextEditor = (
  uri: vscode.Uri,
  content: string = '',
): any => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  document: createMockTextDocument(uri, content),
  selection: {
    active: { line: 0, character: 0 },
  },
});
