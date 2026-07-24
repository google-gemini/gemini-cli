/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { DiffContentProvider, DiffManager } from './diff-manager.js';

const { createdUris } = vi.hoisted(() => ({
  createdUris: [] as Array<{ toString(): string }>,
}));

vi.mock('vscode', () => {
  class TabInputTextDiff {
    constructor(
      readonly original: unknown,
      readonly modified: unknown,
    ) {}
  }
  return {
    EventEmitter: vi.fn(() => ({
      event: vi.fn(),
      fire: vi.fn(),
      dispose: vi.fn(),
    })),
    window: {
      onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
      activeTextEditor: undefined,
      tabGroups: {
        all: [],
        close: vi.fn(),
      },
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
      file: (path: string) => ({
        fsPath: path,
        scheme: 'file',
        toString: () => `file://${path}`,
      }),
      from: (parts: { scheme: string; path: string; query?: string }) => {
        const uri = {
          ...parts,
          toString: () => `${parts.scheme}:${parts.path}?${parts.query ?? ''}`,
        };
        createdUris.push(uri);
        return uri;
      },
      parse: (value: string) => ({ toString: () => value }),
    },
    TabInputTextDiff,
  };
});

describe('DiffManager', () => {
  let manager: DiffManager;

  beforeEach(() => {
    createdUris.length = 0;
    // Reset the globally-mocked tab groups so state does not leak between tests.
    (vscode.window.tabGroups as unknown as { all: vscode.TabGroup[] }).all = [];
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValue(undefined as never);
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({
      getText: () => 'modified content',
    } as unknown as vscode.TextDocument);
    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(
      undefined as never,
    );
    manager = new DiffManager(vi.fn(), new DiffContentProvider());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes the diff tab with preserveFocus=true so terminal focus is kept', async () => {
    const filePath = '/test/file.txt';
    await manager.showDiff(filePath, 'modified content');

    // The right-hand diff document URI created inside showDiff.
    const rightDocUri = createdUris[createdUris.length - 1];
    expect(rightDocUri).toBeDefined();

    // Install a tab group containing the diff tab that targets this URI.
    const tab = {
      input: new vscode.TabInputTextDiff(
        vscode.Uri.file(filePath) as unknown as vscode.Uri,
        rightDocUri as unknown as vscode.Uri,
      ),
    } as unknown as vscode.Tab;
    (vscode.window.tabGroups as unknown as { all: vscode.TabGroup[] }).all = [
      { tabs: [tab] } as unknown as vscode.TabGroup,
    ];

    await manager.closeDiff(filePath);

    // Regression for #22193: closing the background diff tab must pass
    // preserveFocus=true so VS Code does not steal focus from the terminal.
    expect(vscode.window.tabGroups.close).toHaveBeenCalledWith(tab, true);
  });
});
