/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { DiffManager, DiffContentProvider } from './diff-manager.js';

vi.mock('vscode', () => ({
  window: {
    onDidChangeActiveTextEditor: vi.fn(),
    activeTextEditor: undefined,
    tabGroups: {
      all: [],
    },
    showTextDocument: vi.fn(),
  },
  workspace: {
    fs: {
      stat: vi.fn(),
    },
    openTextDocument: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, toString: () => path })),
    from: vi.fn((obj: object) => ({
      ...obj,
      toString: () => JSON.stringify(obj),
    })),
    parse: vi.fn((str: string) => ({ toString: () => str })),
  },
  EventEmitter: vi.fn(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
  TabInputTextDiff: class {},
}));

describe('DiffManager', () => {
  let diffManager: DiffManager;
  let mockProvider: DiffContentProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProvider = new DiffContentProvider();
    diffManager = new DiffManager(vi.fn(), mockProvider);
  });

  it('should use untitled scheme for the left document when the original file does not exist', async () => {
    // Simulate file system error (triggering the catch block in source code)
    vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(
      new Error('File not found'),
    );

    await diffManager.showDiff('/test/path.ts', 'new content');

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'vscode.diff',
      expect.objectContaining({ scheme: 'untitled' }),
      expect.any(Object),
      expect.any(String),
      expect.any(Object),
    );
  });

  it('cancelDiff should fire a rejection notification', async () => {
    const mockUri = { toString: () => 'test-uri' } as unknown as vscode.Uri;

    (
      diffManager as unknown as {
        addDiffDocument: (uri: vscode.Uri, info: object) => void;
      }
    ).addDiffDocument(mockUri, {
      originalFilePath: 'test.ts',
      newContent: 'changed',
      rightDocUri: mockUri,
    });

    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({
      getText: () => 'changed content',
    } as unknown as vscode.TextDocument);

    await diffManager.cancelDiff(mockUri);

    // Access the private emitter to verify the event was fired
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emitter = (diffManager as any).onDidChangeEmitter;
    expect(emitter.fire).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonrpc: '2.0',
        method: 'ide/diffRejected',
        params: {
          filePath: 'test.ts',
        },
      }),
    );

    // Also verify that the diff editor is closed
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'gemini.diff.isVisible',
      false,
    );
  });
});
