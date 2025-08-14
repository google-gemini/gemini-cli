/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'path';
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
    showQuickPick: vi.fn(),
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

describe('activate', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    context = {
      subscriptions: [],
      environmentVariableCollection: {
        replace: vi.fn(),
      },
      globalState: {
        get: vi.fn(),
        update: vi.fn(),
      },
      extensionUri: {
        fsPath: '/path/to/extension',
      },
    } as unknown as vscode.ExtensionContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show the info message on first activation', async () => {
    const showInformationMessageMock = vi
      .mocked(vscode.window.showInformationMessage)
      .mockResolvedValue(undefined as never);
    vi.mocked(context.globalState.get).mockReturnValue(undefined);
    await activate(context);
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'Gemini CLI Companion extension successfully installed. Please restart your terminal to enable full IDE integration.',
      'Re-launch Gemini CLI',
    );
  });

  it('should not show the info message on subsequent activations', async () => {
    vi.mocked(context.globalState.get).mockReturnValue(true);
    await activate(context);
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('should launch the Gemini CLI when the user clicks the button', async () => {
    const showInformationMessageMock = vi
      .mocked(vscode.window.showInformationMessage)
      .mockResolvedValue('Re-launch Gemini CLI' as never);
    vi.mocked(context.globalState.get).mockReturnValue(undefined);
    await activate(context);
    expect(showInformationMessageMock).toHaveBeenCalled();
    await new Promise(process.nextTick); // Wait for the promise to resolve
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'gemini-cli.runGeminiCLI',
    );
  });
});

describe('multi-root workspace handling', () => {
  let context: vscode.ExtensionContext;
  let commandMap: Map<string, (...args: never[]) => unknown>;

  beforeEach(() => {
    commandMap = new Map();
    vi.mocked(vscode.commands.registerCommand).mockImplementation(
      (command: string, callback: (...args: never[]) => unknown) => {
        commandMap.set(command, callback);
        return {
          dispose: vi.fn(),
        };
      },
    );

    context = {
      subscriptions: [],
      environmentVariableCollection: {
        replace: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        get: vi.fn(),
        forEach: vi.fn(),
      },
      globalState: {
        get: vi.fn().mockReturnValue(true), // Assume not first activation
        update: vi.fn(),
      },
      extensionUri: {
        fsPath: '/path/to/extension',
      },
    } as unknown as vscode.ExtensionContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('updateWorkspacePath', () => {
    it('should set the workspace path env var for a single folder', async () => {
      vi.spyOn(vscode.workspace, 'workspaceFolders', 'get').mockReturnValue([
        { uri: { fsPath: '/foo/bar' } } as vscode.WorkspaceFolder,
      ]);
      await activate(context);
      expect(
        context.environmentVariableCollection.replace,
      ).toHaveBeenCalledWith('GEMINI_CLI_IDE_WORKSPACE_PATH', '/foo/bar');
    });

    it('should set a delimited workspace path env var for multiple folders', async () => {
      vi.spyOn(vscode.workspace, 'workspaceFolders', 'get').mockReturnValue([
        { uri: { fsPath: '/foo/bar' } } as vscode.WorkspaceFolder,
        { uri: { fsPath: '/baz/qux' } } as vscode.WorkspaceFolder,
      ]);
      await activate(context);
      expect(
        context.environmentVariableCollection.replace,
      ).toHaveBeenCalledWith(
        'GEMINI_CLI_IDE_WORKSPACE_PATH',
        ['/foo/bar', '/baz/qux'].join(path.delimiter),
      );
    });

    it('should set an empty workspace path env var for no folders', async () => {
      vi.spyOn(vscode.workspace, 'workspaceFolders', 'get').mockReturnValue([]);
      await activate(context);
      expect(
        context.environmentVariableCollection.replace,
      ).toHaveBeenCalledWith('GEMINI_CLI_IDE_WORKSPACE_PATH', '');
    });
  });

  describe('gemini-cli.runGeminiCLI command', () => {
    it('should create a terminal with no CWD if no workspace folder is open', async () => {
      vi.spyOn(vscode.workspace, 'workspaceFolders', 'get').mockReturnValue([]);
      await activate(context);
      const command = commandMap.get('gemini-cli.runGeminiCLI');
      await (command as () => Promise<void>)();
      expect(vscode.window.createTerminal).toHaveBeenCalledWith({
        name: 'Gemini CLI',
        cwd: undefined,
      });
    });

    it('should create a terminal with CWD of the single workspace folder', async () => {
      const workspaceFolder = {
        uri: { fsPath: '/foo/bar' },
      } as vscode.WorkspaceFolder;
      vi.spyOn(vscode.workspace, 'workspaceFolders', 'get').mockReturnValue([
        workspaceFolder,
      ]);
      await activate(context);
      const command = commandMap.get('gemini-cli.runGeminiCLI');
      await (command as () => Promise<void>)();
      expect(vscode.window.createTerminal).toHaveBeenCalledWith({
        name: 'Gemini CLI',
        cwd: '/foo/bar',
      });
    });

    it('should prompt user to select a folder in a multi-root workspace', async () => {
      const workspaceFolders = [
        { name: 'bar', uri: { fsPath: '/foo/bar' } } as vscode.WorkspaceFolder,
        { name: 'qux', uri: { fsPath: '/baz/qux' } } as vscode.WorkspaceFolder,
      ];
      vi.spyOn(vscode.workspace, 'workspaceFolders', 'get').mockReturnValue(
        workspaceFolders,
      );
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        label: 'qux',
        folder: workspaceFolders[1],
      } as never);

      await activate(context);
      const command = commandMap.get('gemini-cli.runGeminiCLI');
      await (command as () => Promise<void>)();

      expect(vscode.window.showQuickPick).toHaveBeenCalled();
      expect(vscode.window.createTerminal).toHaveBeenCalledWith({
        name: 'Gemini CLI',
        cwd: '/baz/qux',
      });
    });

    it('should not create a terminal if user cancels selection', async () => {
      const workspaceFolders = [
        { name: 'bar', uri: { fsPath: '/foo/bar' } } as vscode.WorkspaceFolder,
        { name: 'qux', uri: { fsPath: '/baz/qux' } } as vscode.WorkspaceFolder,
      ];
      vi.spyOn(vscode.workspace, 'workspaceFolders', 'get').mockReturnValue(
        workspaceFolders,
      );
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(
        undefined as never,
      );

      await activate(context);
      const command = commandMap.get('gemini-cli.runGeminiCLI');
      await (command as () => Promise<void>)();

      expect(vscode.window.showQuickPick).toHaveBeenCalled();
      expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    });
  });
});
