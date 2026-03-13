/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { DiffManager, DiffContentProvider } from './diff-manager.js';

const { vscodeMock } = await vi.hoisted(() => import('./utils/vscode-mock.js'));

vi.mock('vscode', () => ({
  ...vscodeMock,
  workspace: {
    ...vscodeMock.workspace,
    openTextDocument: vi.fn(() =>
      Promise.resolve({
        getText: () => 'modified content',
      }),
    ),
    fs: {
      ...vscodeMock.workspace.fs,
      stat: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe('DiffManager', () => {
  let diffManager: DiffManager;
  let diffContentProvider: DiffContentProvider;
  let log: (message: string) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    log = vi.fn();
    diffContentProvider = new DiffContentProvider();
    diffManager = new DiffManager(log, diffContentProvider);
  });

  function setupMockTab(rightDocUri: vscode.Uri) {
    const mockTab = {
      input: new vscode.TabInputTextDiff(
        vscode.Uri.file('/original/path'),
        rightDocUri,
      ),
    };

    (
      vscode.window.tabGroups as unknown as {
        all: Array<{ tabs: Array<{ input: vscode.TabInputTextDiff }> }>;
      }
    ).all = [{ tabs: [mockTab] }];

    return mockTab;
  }

  function getRightDocUriFromDiffCall(): vscode.Uri {
    const diffCall = vi
      .mocked(vscode.commands.executeCommand)
      .mock.calls.find((call) => call[0] === 'vscode.diff');
    if (!diffCall) throw new Error('vscode.diff was not called');
    return diffCall[2] as vscode.Uri;
  }

  const testCases = [
    {
      name: 'closing a diff',
      action: (filePath: string) => diffManager.closeDiff(filePath),
    },
    {
      name: 'accepting a diff',
      action: (_filePath: string, rightDocUri: vscode.Uri) =>
        diffManager.acceptDiff(rightDocUri),
    },
    {
      name: 'cancelling a diff',
      action: (_filePath: string, rightDocUri: vscode.Uri) =>
        diffManager.cancelDiff(rightDocUri),
    },
  ];

  for (const { name, action } of testCases) {
    it(`should call tabGroups.close with preserveFocus=true when ${name}`, async () => {
      const filePath = '/test/file.ts';
      const newContent = 'new content';

      await diffManager.showDiff(filePath, newContent);

      const rightDocUri = getRightDocUriFromDiffCall();
      const mockTab = setupMockTab(rightDocUri);

      await action(filePath, rightDocUri);

      expect(vscode.window.tabGroups.close).toHaveBeenCalledWith(mockTab, true);
    });
  }

  it('should clean up internal state after closing a diff', async () => {
    const filePath = '/test/file.ts';
    await diffManager.showDiff(filePath, 'content');
    const rightDocUri = getRightDocUriFromDiffCall();
    setupMockTab(rightDocUri);

    expect(diffContentProvider.getContent(rightDocUri)).toBe('content');

    await diffManager.closeDiff(filePath);

    expect(diffContentProvider.getContent(rightDocUri)).toBeUndefined();
  });
});
