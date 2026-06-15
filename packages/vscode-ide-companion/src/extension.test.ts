/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { activate, deactivate } from './extension.js';
import {
  IDE_DEFINITIONS,
  detectIdeFromEnv,
} from '@google/gemini-cli-core/src/ide/detect-ide.js';

vi.mock('@google/gemini-cli-core/src/ide/detect-ide.js', async () => {
  const actual = await vi.importActual(
    '@google/gemini-cli-core/src/ide/detect-ide.js',
  );
  return {
    ...actual,
    detectIdeFromEnv: vi.fn(() => IDE_DEFINITIONS.vscode),
  };
});

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      dispose: vi.fn(),
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
    onDidCloseTextDocument: vi.fn(() => ({
      __id: 'onDidCloseTextDocument',
      dispose: vi.fn(),
    })),
    registerTextDocumentContentProvider: vi.fn(() => ({
      __id: 'registerTextDocumentContentProvider',
      dispose: vi.fn(),
    })),
    onDidChangeWorkspaceFolders: vi.fn(() => ({
      __id: 'onDidChangeWorkspaceFolders',
      dispose: vi.fn(),
    })),
    onDidGrantWorkspaceTrust: vi.fn(() => ({
      __id: 'onDidGrantWorkspaceTrust',
      dispose: vi.fn(),
    })),
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
    })),
  },
  commands: {
    registerCommand: vi.fn((command: string) => ({
      __id: command,
      dispose: vi.fn(),
    })),
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
  extensions: {
    getExtension: vi.fn(),
  },
}));

describe('activate', () => {
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
      undefined,
    );
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
      extension: {
        packageJSON: {
          version: '1.1.0',
        },
      },
    } as unknown as vscode.ExtensionContext;
  });

  afterEach(async () => {
    await deactivate();
    vi.restoreAllMocks();
  });

  it('should show the info message on first activation', async () => {
    const showInformationMessageMock = vi
      .mocked(vscode.window.showInformationMessage)
      .mockResolvedValue(undefined as never);
    vi.mocked(context.globalState.get).mockReturnValue(undefined);
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      packageJSON: { version: '1.1.0' },
    } as vscode.Extension<unknown>);
    await activate(context);
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'Gemini CLI Companion extension successfully installed.',
    );
  });

  it('should not show the info message on subsequent activations', async () => {
    vi.mocked(context.globalState.get).mockReturnValue(true);
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      packageJSON: { version: '1.1.0' },
    } as vscode.Extension<unknown>);
    await activate(context);
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('should register a handler for onDidGrantWorkspaceTrust', async () => {
    await activate(context);
    expect(vscode.workspace.onDidGrantWorkspaceTrust).toHaveBeenCalled();
  });

  it('adds every registered disposable to context.subscriptions', async () => {
    await activate(context);
    const ids = context.subscriptions.map(
      (d) => (d as unknown as { __id?: string }).__id,
    );
    expect(ids).toContain('gemini.diff.accept');
    expect(ids).toContain('gemini.diff.cancel');
    expect(ids).toContain('onDidChangeWorkspaceFolders');
    expect(ids).toContain('onDidGrantWorkspaceTrust');
  });

  it('should launch the Gemini CLI when the user clicks the button', async () => {
    const showInformationMessageMock = vi
      .mocked(vscode.window.showInformationMessage)
      .mockResolvedValue('Re-launch Gemini CLI' as never);
    vi.mocked(context.globalState.get).mockReturnValue(undefined);
    vi.mocked(vscode.extensions.getExtension).mockReturnValue({
      packageJSON: { version: '1.1.0' },
    } as vscode.Extension<unknown>);
    await activate(context);
    expect(showInformationMessageMock).toHaveBeenCalledWith(
      'Gemini CLI Companion extension successfully installed.',
    );
  });

  describe('update notification', () => {
    beforeEach(() => {
      // Prevent the "installed" message from showing
      vi.mocked(context.globalState.get).mockReturnValue(true);
    });

    it('should show an update notification if a newer version is available', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              extensions: [
                {
                  versions: [{ version: '1.2.0' }],
                },
              ],
            },
          ],
        }),
      } as Response);

      const showInformationMessageMock = vi.mocked(
        vscode.window.showInformationMessage,
      );

      await activate(context);

      expect(showInformationMessageMock).toHaveBeenCalledWith(
        'A new version (1.2.0) of the Gemini CLI Companion extension is available.',
        'Update to latest version',
      );
    });

    it('should not show an update notification if the version is the same', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              extensions: [
                {
                  versions: [{ version: '1.1.0' }],
                },
              ],
            },
          ],
        }),
      } as Response);

      const showInformationMessageMock = vi.mocked(
        vscode.window.showInformationMessage,
      );

      await activate(context);

      expect(showInformationMessageMock).not.toHaveBeenCalled();
    });

    it.each([
      {
        ide: IDE_DEFINITIONS.cloudshell,
      },
      { ide: IDE_DEFINITIONS.firebasestudio },
    ])(
      'does not show install or update messages for $ide.name',
      async ({ ide }) => {
        vi.mocked(detectIdeFromEnv).mockReturnValue(ide);
        vi.mocked(context.globalState.get).mockReturnValue(undefined);
        vi.spyOn(global, 'fetch').mockResolvedValue({
          ok: true,
          json: async () => ({
            results: [
              {
                extensions: [
                  {
                    versions: [{ version: '1.2.0' }],
                  },
                ],
              },
            ],
          }),
        } as Response);
        const showInformationMessageMock = vi.mocked(
          vscode.window.showInformationMessage,
        );

        await activate(context);

        expect(showInformationMessageMock).not.toHaveBeenCalled();
      },
    );

    it('should not show an update notification if the version is older', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              extensions: [
                {
                  versions: [{ version: '1.0.0' }],
                },
              ],
            },
          ],
        }),
      } as Response);

      const showInformationMessageMock = vi.mocked(
        vscode.window.showInformationMessage,
      );

      await activate(context);

      expect(showInformationMessageMock).not.toHaveBeenCalled();
    });

    it('should execute the install command when the user clicks "Update"', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              extensions: [
                {
                  versions: [{ version: '1.2.0' }],
                },
              ],
            },
          ],
        }),
      } as Response);
      vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
        'Update to latest version' as never,
      );
      const executeCommandMock = vi.mocked(vscode.commands.executeCommand);

      await activate(context);

      // Wait for the promise from showInformationMessage.then() to resolve
      await new Promise(process.nextTick);

      expect(executeCommandMock).toHaveBeenCalledWith(
        'workbench.extensions.installExtension',
        'Google.gemini-cli-vscode-ide-companion',
      );
    });

    it('should handle fetch errors gracefully', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      } as Response);

      const showInformationMessageMock = vi.mocked(
        vscode.window.showInformationMessage,
      );

      await activate(context);

      expect(showInformationMessageMock).not.toHaveBeenCalled();
    });
  });
});
