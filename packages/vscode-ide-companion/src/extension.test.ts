/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { activate } from './extension.js';
import {
  IDE_DEFINITIONS,
  detectIdeFromEnv,
} from '@google/gemini-cli-core/src/ide/detect-ide.js';

const { vscodeMock } = await vi.hoisted(() => import('./utils/vscode-mock.js'));

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
  ...vscodeMock,
  window: {
    ...vscodeMock.window,
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
    })),
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

  afterEach(() => {
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

  it('should not make any network requests during activation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await activate(context);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    {
      ide: IDE_DEFINITIONS.cloudshell,
    },
    { ide: IDE_DEFINITIONS.firebasestudio },
  ])(
    'does not show install message for $ide.name and makes no network requests',
    async ({ ide }) => {
      vi.mocked(detectIdeFromEnv).mockReturnValue(ide);
      vi.mocked(context.globalState.get).mockReturnValue(undefined);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const showInformationMessageMock = vi.mocked(
        vscode.window.showInformationMessage,
      );

      await activate(context);

      expect(showInformationMessageMock).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('should register gemini.diff.open command and handle empty or partial arguments safely', async () => {
    const registerCommandMock = vi.mocked(vscode.commands.registerCommand);

    await activate(context);

    const openCommandCall = registerCommandMock.mock.calls.find(
      (call) => call[0] === 'gemini.diff.open',
    );
    expect(openCommandCall).toBeDefined();

    const handler = openCommandCall![1] as (args?: {
      filePath?: string;
      newContent?: string;
    }) => Promise<void>;
    expect(handler).toBeInstanceOf(Function);

    // Call handler with empty or partial args to ensure it doesn't throw or crash
    await expect(handler()).resolves.not.toThrow();
    await expect(handler({ filePath: '/test.ts' })).resolves.not.toThrow();
  });
});
