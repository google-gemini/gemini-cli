/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { DiffManager, DiffContentProvider } from './diff-manager.js';
import { type JSONRPCNotification } from '@modelcontextprotocol/sdk/types.js';

const { vscodeMock } = await vi.hoisted(() => import('./utils/vscode-mock.js'));

vi.mock('vscode', () => ({
  ...vscodeMock,
  workspace: {
    ...vscodeMock.workspace,
    openTextDocument: vi.fn().mockResolvedValue({
      getText: () => 'modified content',
    }),
    fs: {
      ...vscodeMock.workspace.fs,
      stat: vi.fn(),
    },
  },
}));

interface MockTab {
  input: vscode.TabInputTextDiff;
}

interface MockTabGroup {
  tabs: MockTab[];
}

describe('DiffManager Comprehensive Unit Tests', () => {
  let diffManager: DiffManager;
  let diffContentProvider: DiffContentProvider;
  let log: (message: string) => void;
  let eventsFired: JSONRPCNotification[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValue(
      {} as unknown as vscode.FileStat,
    ); // Default to existing file
    log = vi.fn();
    eventsFired = [];
    diffContentProvider = new DiffContentProvider();
    diffManager = new DiffManager(log, diffContentProvider);
    diffManager.onDidChange((event) => {
      eventsFired.push(event);
    });
  });

  function getRightDocUriFromDiffCall(): vscode.Uri {
    const diffCall = vi
      .mocked(vscode.commands.executeCommand)
      .mock.calls.find((call) => call[0] === 'vscode.diff');
    if (!diffCall) throw new Error('vscode.diff was not called');
    return diffCall[2] as vscode.Uri;
  }

  function setupMockTab(rightDocUri: vscode.Uri): vscode.Tab {
    const mockTab: MockTab = {
      input: new vscode.TabInputTextDiff(
        vscode.Uri.file('/test/file.ts'),
        rightDocUri,
      ),
    };
    const mockTabGroup: MockTabGroup = {
      tabs: [mockTab],
    };
    (vscode.window.tabGroups as unknown as { all: vscode.TabGroup[] }).all = [
      mockTabGroup as unknown as vscode.TabGroup,
    ];
    return mockTab as unknown as vscode.Tab;
  }

  describe('showDiff', () => {
    it('should set diff isVisible context and execute vscode.diff when showing diff for existing file', async () => {
      const filePath = '/test/file.ts';
      const newContent = 'new content';

      await diffManager.showDiff(filePath, newContent);

      // Verify context set to true
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gemini.diff.isVisible',
        true,
      );

      // Verify vscode.diff call has correct parameters
      const diffCall = vi
        .mocked(vscode.commands.executeCommand)
        .mock.calls.find((call) => call[0] === 'vscode.diff');
      expect(diffCall).toBeDefined();
      expect(diffCall![1].scheme).toBe('file');
      expect(diffCall![2].scheme).toBe('gemini-diff');
      expect(diffCall![2].path).toBe(filePath);
      expect(diffCall![3]).toBe('file.ts ↔ Modified');
      expect(diffCall![4]).toEqual({
        preview: false,
        preserveFocus: true,
      });

      // Verify diffContentProvider content is set correctly
      const rightDocUri = diffCall![2] as vscode.Uri;
      expect(diffContentProvider.getContent(rightDocUri)).toBe(newContent);
    });

    it('should fallback to untitled schema when the original file does not exist', async () => {
      const filePath = '/test/new-file.ts';
      const newContent = 'new content';
      vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(
        new Error('ENOENT'),
      ); // Mock missing file

      await diffManager.showDiff(filePath, newContent);

      const diffCall = vi
        .mocked(vscode.commands.executeCommand)
        .mock.calls.find((call) => call[0] === 'vscode.diff');
      expect(diffCall).toBeDefined();
      expect(diffCall![1].scheme).toBe('untitled');
      expect(diffCall![1].path).toBe(filePath);
    });
  });

  describe('closeDiff', () => {
    it('should close tab with preserveFocus = true, clean up content, and set isVisible context to false', async () => {
      const filePath = '/test/file.ts';
      await diffManager.showDiff(filePath, 'content');

      const rightDocUri = getRightDocUriFromDiffCall();
      const mockTab = setupMockTab(rightDocUri);

      // Execute closeDiff
      await diffManager.closeDiff(filePath);

      // Verify isVisible context set to false
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gemini.diff.isVisible',
        false,
      );

      // Verify tab closed with keepFocus parameter
      expect(vscode.window.tabGroups.close).toHaveBeenCalledWith(mockTab, true);

      // Verify state was cleaned up
      expect(diffContentProvider.getContent(rightDocUri)).toBeUndefined();
    });

    it('should do nothing gracefully if file does not match any open diff', async () => {
      await diffManager.closeDiff('/nonexistent.ts');
      expect(vscode.window.tabGroups.close).not.toHaveBeenCalled();
    });
  });

  describe('acceptDiff', () => {
    it('should close tab, clean up content, and fire ide/diffAccepted notification', async () => {
      const filePath = '/test/file.ts';
      await diffManager.showDiff(filePath, 'content');

      const rightDocUri = getRightDocUriFromDiffCall();
      const mockTab = setupMockTab(rightDocUri);

      // Execute acceptDiff
      await diffManager.acceptDiff(rightDocUri);

      // Verify isVisible context set to false
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gemini.diff.isVisible',
        false,
      );

      // Verify tab closed with keepFocus parameter
      expect(vscode.window.tabGroups.close).toHaveBeenCalledWith(mockTab, true);

      // Verify state was cleaned up
      expect(diffContentProvider.getContent(rightDocUri)).toBeUndefined();

      // Verify RPC event fired with correct JSON-RPC schema and modified content
      expect(eventsFired).toHaveLength(1);
      expect(eventsFired[0]).toEqual({
        jsonrpc: '2.0',
        method: 'ide/diffAccepted',
        params: {
          filePath,
          content: 'modified content',
        },
      });
    });

    it('should gracefully return early if diff document has been removed', async () => {
      const rightDocUri = vscode.Uri.from({
        scheme: 'gemini-diff',
        path: '/untracked.ts',
      });
      await diffManager.acceptDiff(rightDocUri);

      expect(vscode.window.tabGroups.close).not.toHaveBeenCalled();
      expect(eventsFired).toHaveLength(0);
    });
  });

  describe('cancelDiff', () => {
    it('should close tab, clean up content, and fire ide/diffRejected notification', async () => {
      const filePath = '/test/file.ts';
      await diffManager.showDiff(filePath, 'content');

      const rightDocUri = getRightDocUriFromDiffCall();
      const mockTab = setupMockTab(rightDocUri);

      // Execute cancelDiff
      await diffManager.cancelDiff(rightDocUri);

      // Verify isVisible context set to false
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gemini.diff.isVisible',
        false,
      );

      // Verify tab closed with keepFocus parameter
      expect(vscode.window.tabGroups.close).toHaveBeenCalledWith(mockTab, true);

      // Verify state was cleaned up
      expect(diffContentProvider.getContent(rightDocUri)).toBeUndefined();

      // Verify RPC event fired with correct JSON-RPC schema
      expect(eventsFired).toHaveLength(1);
      expect(eventsFired[0]).toEqual({
        jsonrpc: '2.0',
        method: 'ide/diffRejected',
        params: {
          filePath,
        },
      });
    });

    it('should close tab gracefully even if diff document has been removed', async () => {
      const rightDocUri = vscode.Uri.from({
        scheme: 'gemini-diff',
        path: '/untracked.ts',
      });
      const mockTab = setupMockTab(rightDocUri);

      await diffManager.cancelDiff(rightDocUri);

      expect(vscode.window.tabGroups.close).toHaveBeenCalledWith(mockTab, true);
      expect(eventsFired).toHaveLength(0);
    });
  });

  describe('active editor visibility tracking', () => {
    it('should update gemini.diff.isVisible context based on active editor matching open diff document', async () => {
      const filePath = '/test/file.ts';
      await diffManager.showDiff(filePath, 'content');

      const rightDocUri = getRightDocUriFromDiffCall();

      // Retrieve the listener registered inside the constructor
      const onDidChangeActiveTextEditor = vi.mocked(
        vscode.window.onDidChangeActiveTextEditor,
      );
      expect(onDidChangeActiveTextEditor).toHaveBeenCalled();
      const activeEditorListener = onDidChangeActiveTextEditor.mock.calls[0][0];

      // Simulate editor change to our tracked rightDocUri
      const mockEditor = {
        document: {
          uri: rightDocUri,
        },
      };
      await activeEditorListener(mockEditor as unknown as vscode.TextEditor);

      // Verify isVisible updated to true
      expect(vscode.commands.executeCommand).toHaveBeenLastCalledWith(
        'setContext',
        'gemini.diff.isVisible',
        true,
      );

      // Simulate editor change to unrelated editor
      const mockUnrelatedEditor = {
        document: {
          uri: vscode.Uri.file('/test/unrelated.ts'),
        },
      };
      await activeEditorListener(
        mockUnrelatedEditor as unknown as vscode.TextEditor,
      );

      // Verify isVisible updated to false
      expect(vscode.commands.executeCommand).toHaveBeenLastCalledWith(
        'setContext',
        'gemini.diff.isVisible',
        false,
      );
    });
  });
});
