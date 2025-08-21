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
    showWorkspaceFolderPick: vi.fn(),
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
      'Gemini CLI Companion extension successfully installed.',
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
    const commandCallback = vi
      .mocked(vscode.commands.registerCommand)
      .mock.calls.find((call) => call[0] === 'gemini-cli.runGeminiCLI')?.[1];

    expect(commandCallback).toBeDefined();
  });
});
