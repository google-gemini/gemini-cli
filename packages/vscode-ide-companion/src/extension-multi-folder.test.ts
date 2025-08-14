/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { activate } from './extension.js';

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
    })),
    showInformationMessage: vi.fn(),
    createTerminal: vi.fn(() => ({
      show: vi.fn(),
      sendText: vi.fn(),
    })),
    onDidChangeActiveTextEditor: vi.fn(),
    activeTextEditor: undefined,
    tabGroups: {
      all: [],
      close: vi.fn(),
    },
    showTextDocument: vi.fn(),
  },
  workspace: {
    workspaceFolders: [],
    onDidCloseTextDocument: vi.fn(),
    registerTextDocumentContentProvider: vi.fn(),
    onDidChangeWorkspaceFolders: vi.fn(),
  },
  commands: {
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
  },
  Uri: {
    joinPath: vi.fn(),
    file: (path: string) => ({ fsPath: path }),
  },
  ExtensionMode: {
    Development: 1,
    Production: 2,
  },
  EventEmitter: vi.fn(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
}));

describe('activate with multiple folders', () => {
  let context: vscode.ExtensionContext;
  let onDidChangeWorkspaceFoldersCallback: (
    e: vscode.WorkspaceFoldersChangeEvent,
  ) => void;

  beforeEach(() => {
    context = {
      subscriptions: [],
      environmentVariableCollection: {
        replace: vi.fn(),
      },
      globalState: {
        get: vi.fn().mockReturnValue(true),
        update: vi.fn(),
      },
      extensionUri: {
        fsPath: '/path/to/extension',
      },
    } as unknown as vscode.ExtensionContext;

    vi.mocked(vscode.workspace.onDidChangeWorkspaceFolders).mockImplementation(
      (callback) => {
        onDidChangeWorkspaceFoldersCallback = callback;
        return { dispose: vi.fn() };
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should set a single folder path', async () => {
    const workspaceFoldersSpy = vi.spyOn(
      vscode.workspace,
      'workspaceFolders',
      'get',
    );
    workspaceFoldersSpy.mockReturnValue([
      { uri: { fsPath: '/foo/bar' } },
    ] as vscode.WorkspaceFolder[]);

    await activate(context);

    expect(context.environmentVariableCollection.replace).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      '/foo/bar',
    );
  });

  it('should set multiple folder paths, separated by a colon', async () => {
    const workspaceFoldersSpy = vi.spyOn(
      vscode.workspace,
      'workspaceFolders',
      'get',
    );
    workspaceFoldersSpy.mockReturnValue([
      { uri: { fsPath: '/foo/bar' } },
      { uri: { fsPath: '/baz/qux' } },
    ] as vscode.WorkspaceFolder[]);

    await activate(context);

    expect(context.environmentVariableCollection.replace).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      '/foo/bar:/baz/qux',
    );
  });

  it('should set an empty string if no folders are open', async () => {
    const workspaceFoldersSpy = vi.spyOn(
      vscode.workspace,
      'workspaceFolders',
      'get',
    );
    workspaceFoldersSpy.mockReturnValue([]);

    await activate(context);

    expect(context.environmentVariableCollection.replace).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      '',
    );
  });

  it('should update the path when workspace folders change', async () => {
    const workspaceFoldersSpy = vi.spyOn(
      vscode.workspace,
      'workspaceFolders',
      'get',
    );
    workspaceFoldersSpy.mockReturnValue([
      { uri: { fsPath: '/foo/bar' } },
    ] as vscode.WorkspaceFolder[]);

    await activate(context);

    expect(context.environmentVariableCollection.replace).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      '/foo/bar',
    );

    // Simulate adding a folder
    workspaceFoldersSpy.mockReturnValue([
      { uri: { fsPath: '/foo/bar' } },
      { uri: { fsPath: '/baz/qux' } },
    ] as vscode.WorkspaceFolder[]);
    onDidChangeWorkspaceFoldersCallback({
      added: [{ uri: { fsPath: '/baz/qux' } } as vscode.WorkspaceFolder],
      removed: [],
    });

    expect(context.environmentVariableCollection.replace).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      '/foo/bar:/baz/qux',
    );

    // Simulate removing a folder
    workspaceFoldersSpy.mockReturnValue([
      { uri: { fsPath: '/baz/qux' } },
    ] as vscode.WorkspaceFolder[]);
    onDidChangeWorkspaceFoldersCallback({
      added: [],
      removed: [{ uri: { fsPath: '/foo/bar' } } as vscode.WorkspaceFolder],
    });

    expect(context.environmentVariableCollection.replace).toHaveBeenCalledWith(
      'GEMINI_CLI_IDE_WORKSPACE_PATH',
      '/baz/qux',
    );
  });
});
