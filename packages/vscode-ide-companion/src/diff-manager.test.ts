/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { DiffContentProvider, DiffManager } from './diff-manager.js';

vi.mock('vscode', () => {
  const EventEmitterMock = vi.fn(() => {
    const listeners: Array<(arg: unknown) => void> = [];
    return {
      event: vi.fn((listener: (arg: unknown) => void) => {
        listeners.push(listener);
        return { dispose: vi.fn() };
      }),
      fire: vi.fn((arg: unknown) => {
        listeners.forEach((listener) => listener(arg));
      }),
      dispose: vi.fn(),
    };
  });

  return {
    EventEmitter: EventEmitterMock,
    window: {
      onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
      activeTextEditor: undefined,
      tabGroups: {
        all: [],
        close: vi.fn(),
      },
    },
    workspace: {
      openTextDocument: vi.fn(),
      fs: {
        stat: vi.fn(),
      },
    },
    commands: {
      executeCommand: vi.fn(),
    },
    Uri: {
      file: vi.fn((path: string) => ({
        fsPath: path,
        toString: () => `file://${path}`,
        scheme: 'file',
        path,
      })),
      from: vi.fn((components: Record<string, unknown>) => ({
        ...components,
        toString: () =>
          `${components.scheme}://${components.path}${components.query ? `?${components.query}` : ''}`,
      })),
      parse: vi.fn((str: string) => {
        const [scheme, rest] = str.split('://');
        const [path, query] = rest?.split('?') || ['', ''];
        return {
          scheme,
          path: rest || '',
          query: query || '',
          fsPath: path,
          toString: () => str,
        };
      }),
    },
  };
});

describe('DiffContentProvider', () => {
  let provider: DiffContentProvider;
  let testUri: vscode.Uri;

  beforeEach(() => {
    provider = new DiffContentProvider();
    testUri = vscode.Uri.from({
      scheme: 'gemini-diff',
      path: '/test/file.ts',
      query: 'rand=123',
    });
  });

  describe('provideTextDocumentContent', () => {
    it('should return empty string for unknown URI', () => {
      const content = provider.provideTextDocumentContent(testUri);
      expect(content).toBe('');
    });

    it('should return content for known URI', () => {
      const testContent = 'console.log("test");';
      provider.setContent(testUri, testContent);

      const content = provider.provideTextDocumentContent(testUri);
      expect(content).toBe(testContent);
    });
  });

  describe('setContent', () => {
    it('should store content for URI', () => {
      const testContent = 'const x = 42;';
      provider.setContent(testUri, testContent);

      expect(provider.getContent(testUri)).toBe(testContent);
    });

    it('should fire onDidChange event when content is set', () => {
      const listener = vi.fn();
      provider.onDidChange(listener);

      const testContent = 'test content';
      provider.setContent(testUri, testContent);

      expect(listener).toHaveBeenCalledWith(testUri);
    });

    it('should update existing content', () => {
      provider.setContent(testUri, 'original');
      provider.setContent(testUri, 'updated');

      expect(provider.getContent(testUri)).toBe('updated');
    });
  });

  describe('deleteContent', () => {
    it('should remove content for URI', () => {
      provider.setContent(testUri, 'test');
      provider.deleteContent(testUri);

      expect(provider.getContent(testUri)).toBeUndefined();
    });

    it('should not error when deleting non-existent content', () => {
      expect(() => provider.deleteContent(testUri)).not.toThrow();
    });
  });

  describe('getContent', () => {
    it('should return undefined for unknown URI', () => {
      expect(provider.getContent(testUri)).toBeUndefined();
    });

    it('should return content for known URI', () => {
      const testContent = 'function test() {}';
      provider.setContent(testUri, testContent);

      expect(provider.getContent(testUri)).toBe(testContent);
    });
  });

  describe('multiple URIs', () => {
    it('should handle multiple URIs independently', () => {
      const uri1 = vscode.Uri.from({
        scheme: 'gemini-diff',
        path: '/file1.ts',
      });
      const uri2 = vscode.Uri.from({
        scheme: 'gemini-diff',
        path: '/file2.ts',
      });

      provider.setContent(uri1, 'content1');
      provider.setContent(uri2, 'content2');

      expect(provider.getContent(uri1)).toBe('content1');
      expect(provider.getContent(uri2)).toBe('content2');
    });
  });
});

describe('DiffManager', () => {
  let diffManager: DiffManager;
  let diffContentProvider: DiffContentProvider;
  let logMessages: string[];
  let setContentSpy: any;

  const createMockTextDocument = (uri: vscode.Uri, content: string) => ({
    uri,
    getText: vi.fn(() => content),
    fileName: uri.fsPath,
    lineCount: content.split('\n').length,
  });

  beforeEach(() => {
    logMessages = [];
    const mockLog = (message: string) => {
      logMessages.push(message);
    };

    diffContentProvider = new DiffContentProvider();
    setContentSpy = vi.spyOn(diffContentProvider, 'setContent');
    diffManager = new DiffManager(mockLog, diffContentProvider);

    vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({} as never);
    vi.mocked(vscode.workspace.openTextDocument).mockImplementation(
      async (uri: vscode.Uri) => {
        const content = diffContentProvider.getContent(uri) || '';
        return createMockTextDocument(uri, content) as never;
      },
    );
  });

  afterEach(() => {
    diffManager.dispose();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should register active editor change listener', () => {
      expect(vscode.window.onDidChangeActiveTextEditor).toHaveBeenCalled();
    });

    it('should set initial visibility context', () => {
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gemini.diff.isVisible',
        false,
      );
    });
  });

  describe('showDiff', () => {
    it('should create diff view for existing file', async () => {
      const filePath = '/test/existing.ts';
      const newContent = 'const updated = true;';

      await diffManager.showDiff(filePath, newContent);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gemini.diff.isVisible',
        true,
      );
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.diff',
        expect.any(Object),
        expect.any(Object),
        expect.stringContaining('existing.ts'),
        expect.objectContaining({
          preview: false,
          preserveFocus: true,
        }),
      );
    });

    it('should handle non-existent file with untitled scheme', async () => {
      vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(
        new Error('File not found'),
      );

      const filePath = '/test/new.ts';
      const newContent = 'const newFile = true;';

      await diffManager.showDiff(filePath, newContent);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.diff',
        expect.objectContaining({ scheme: 'untitled' }),
        expect.any(Object),
        expect.stringContaining('new.ts'),
        expect.any(Object),
      );
    });

    it('should set content in provider', async () => {
      const filePath = '/test/file.ts';
      const newContent = 'new content';

      await diffManager.showDiff(filePath, newContent);

      // Check that some URI was set with the content
      expect(setContentSpy).toHaveBeenCalled();
      const [_uri, content] = setContentSpy.mock.calls[0];
      expect(content).toBe(newContent);
    });

    it('should make editor writable', async () => {
      await diffManager.showDiff('/test/file.ts', 'content');

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'workbench.action.files.setActiveEditorWriteableInSession',
      );
    });

    it('should generate unique URI with cache busting', async () => {
      const filePath = '/test/file.ts';

      await diffManager.showDiff(filePath, 'content1');
      await diffManager.showDiff(filePath, 'content2');

      expect(setContentSpy).toHaveBeenCalledTimes(2);

      // URIs should be different due to cache busting
      const uri1 = setContentSpy.mock.calls[0][0].toString();
      const uri2 = setContentSpy.mock.calls[1][0].toString();
      expect(uri1).not.toBe(uri2);
    });
  });

  describe('closeDiff', () => {
    it('should close diff and return modified content', async () => {
      const filePath = '/test/file.ts';
      const originalContent = 'original';
      const modifiedContent = 'modified';

      await diffManager.showDiff(filePath, originalContent);

      // Simulate user modifying content
      const diffUri = setContentSpy.mock.calls[0][0];
      diffContentProvider.setContent(diffUri, modifiedContent);

      const result = await diffManager.closeDiff(filePath);

      expect(result).toBe(modifiedContent);
    });

    it('should fire diffClosed notification', async () => {
      const listener = vi.fn();
      diffManager.onDidChange(listener);

      const filePath = '/test/file.ts';
      await diffManager.showDiff(filePath, 'content');
      await diffManager.closeDiff(filePath);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'ide/diffClosed',
          params: expect.objectContaining({
            filePath,
          }),
        }),
      );
    });

    it('should not fire notification when suppressNotification is true', async () => {
      const listener = vi.fn();
      diffManager.onDidChange(listener);

      const filePath = '/test/file.ts';
      await diffManager.showDiff(filePath, 'content');
      await diffManager.closeDiff(filePath, true);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should return undefined for non-existent diff', async () => {
      const result = await diffManager.closeDiff('/non/existent.ts');
      expect(result).toBeUndefined();
    });

    it('should set visibility context to false', async () => {
      const filePath = '/test/file.ts';
      await diffManager.showDiff(filePath, 'content');

      vi.mocked(vscode.commands.executeCommand).mockClear();

      await diffManager.closeDiff(filePath);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gemini.diff.isVisible',
        false,
      );
    });

    it('should clean up provider content', async () => {
      const filePath = '/test/file.ts';
      await diffManager.showDiff(filePath, 'content');

      const diffUri = setContentSpy.mock.calls[0][0];

      await diffManager.closeDiff(filePath);

      expect(diffContentProvider.getContent(diffUri)).toBeUndefined();
    });
  });

  describe('acceptDiff', () => {
    it('should fire diffAccepted notification', async () => {
      const listener = vi.fn();
      diffManager.onDidChange(listener);

      const filePath = '/test/file.ts';
      const content = 'accepted content';

      await diffManager.showDiff(filePath, content);
      const diffUri = setContentSpy.mock.calls[0][0];

      await diffManager.acceptDiff(diffUri);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'ide/diffAccepted',
          params: expect.objectContaining({
            filePath,
            content,
          }),
        }),
      );
    });

    it('should close diff editor', async () => {
      const filePath = '/test/file.ts';
      await diffManager.showDiff(filePath, 'content');

      const diffUri = setContentSpy.mock.calls[0][0];

      await diffManager.acceptDiff(diffUri);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gemini.diff.isVisible',
        false,
      );
    });

    it('should handle modified content in accepted diff', async () => {
      const listener = vi.fn();
      diffManager.onDidChange(listener);

      const filePath = '/test/file.ts';
      await diffManager.showDiff(filePath, 'original');

      const diffUri = setContentSpy.mock.calls[0][0];
      const modifiedContent = 'user modified';
      diffContentProvider.setContent(diffUri, modifiedContent);

      await diffManager.acceptDiff(diffUri);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            content: modifiedContent,
          }),
        }),
      );
    });

    it('should log error for unknown diff URI', async () => {
      const unknownUri = vscode.Uri.from({
        scheme: 'gemini-diff',
        path: '/unknown.ts',
      });

      await diffManager.acceptDiff(unknownUri);

      expect(logMessages.length).toBeGreaterThan(0);
      expect(logMessages[0]).toContain('No diff info found');
    });
  });

  describe('cancelDiff', () => {
    it('should fire diffClosed notification', async () => {
      const listener = vi.fn();
      diffManager.onDidChange(listener);

      const filePath = '/test/file.ts';
      await diffManager.showDiff(filePath, 'content');

      const diffUri = setContentSpy.mock.calls[0][0];

      await diffManager.cancelDiff(diffUri);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'ide/diffClosed',
        }),
      );
    });

    it('should close diff editor', async () => {
      const filePath = '/test/file.ts';
      await diffManager.showDiff(filePath, 'content');

      const diffUri = setContentSpy.mock.calls[0][0];

      vi.mocked(vscode.commands.executeCommand).mockClear();

      await diffManager.cancelDiff(diffUri);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gemini.diff.isVisible',
        false,
      );
    });

    it('should close editor even without diff info', async () => {
      const unknownUri = vscode.Uri.from({
        scheme: 'gemini-diff',
        path: '/unknown.ts',
      });

      await diffManager.cancelDiff(unknownUri);

      expect(vscode.commands.executeCommand).toHaveBeenCalled();
    });

    it('should log warning for unknown diff URI', async () => {
      const unknownUri = vscode.Uri.from({
        scheme: 'gemini-diff',
        path: '/unknown.ts',
      });

      await diffManager.cancelDiff(unknownUri);

      expect(logMessages.some((msg) => msg.includes('No diff info found'))).toBe(
        true,
      );
    });
  });

  describe('active editor tracking', () => {
    it('should update visibility when switching to diff editor', async () => {
      const filePath = '/test/file.ts';
      await diffManager.showDiff(filePath, 'content');

      const diffUri = setContentSpy.mock.calls[0][0];

      vi.mocked(vscode.commands.executeCommand).mockClear();

      // Simulate editor change
      const onDidChangeActiveTextEditor = vi.mocked(
        vscode.window.onDidChangeActiveTextEditor,
      );
      const listener =
        onDidChangeActiveTextEditor.mock.calls[
          onDidChangeActiveTextEditor.mock.calls.length - 1
        ][0];

      const mockEditor = {
        document: createMockTextDocument(diffUri, 'content'),
      };

      await listener(mockEditor as never);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gemini.diff.isVisible',
        true,
      );
    });

    it('should update visibility when switching away from diff editor', async () => {
      const filePath = '/test/file.ts';
      await diffManager.showDiff(filePath, 'content');

      vi.mocked(vscode.commands.executeCommand).mockClear();

      const onDidChangeActiveTextEditor = vi.mocked(
        vscode.window.onDidChangeActiveTextEditor,
      );
      const listener =
        onDidChangeActiveTextEditor.mock.calls[
          onDidChangeActiveTextEditor.mock.calls.length - 1
        ][0];

      const otherUri = vscode.Uri.file('/other/file.ts');
      const mockEditor = {
        document: createMockTextDocument(otherUri, 'other content'),
      };

      await listener(mockEditor as never);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gemini.diff.isVisible',
        false,
      );
    });

    it('should handle undefined editor', async () => {
      const onDidChangeActiveTextEditor = vi.mocked(
        vscode.window.onDidChangeActiveTextEditor,
      );
      const listener =
        onDidChangeActiveTextEditor.mock.calls[
          onDidChangeActiveTextEditor.mock.calls.length - 1
        ][0];

      await listener(undefined as never);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gemini.diff.isVisible',
        false,
      );
    });
  });

  describe('dispose', () => {
    it('should dispose all subscriptions', () => {
      const disposeSpy = vi.fn();
      const mockSubscription = { dispose: disposeSpy };

      // Create new manager with mock subscription
      const manager = new DiffManager(
        () => {},
        new DiffContentProvider(),
      ) as { dispose: () => void; subscriptions: unknown[] };
      manager.subscriptions = [mockSubscription];

      manager.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should not error when disposing multiple times', () => {
      expect(() => {
        diffManager.dispose();
        diffManager.dispose();
      }).not.toThrow();
    });
  });

  describe('concurrent diff handling', () => {
    it('should handle multiple diffs for different files', async () => {
      await diffManager.showDiff('/file1.ts', 'content1');
      await diffManager.showDiff('/file2.ts', 'content2');

      const result1 = await diffManager.closeDiff('/file1.ts');
      const result2 = await diffManager.closeDiff('/file2.ts');

      expect(result1).toBe('content1');
      expect(result2).toBe('content2');
    });

    it('should replace diff when showing same file twice', async () => {
      await diffManager.showDiff('/file.ts', 'v1');
      await diffManager.showDiff('/file.ts', 'v2');

      // The second call creates a new diff URI, old one should still be accessible
      expect(setContentSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty file paths', async () => {
      await expect(diffManager.showDiff('', 'content')).resolves.not.toThrow();
    });

    it('should handle empty content', async () => {
      await expect(
        diffManager.showDiff('/file.ts', ''),
      ).resolves.not.toThrow();
    });

    it('should handle very long content', async () => {
      const longContent = 'x'.repeat(100000);
      await expect(
        diffManager.showDiff('/file.ts', longContent),
      ).resolves.not.toThrow();
    });

    it('should handle special characters in file path', async () => {
      const specialPath = '/test/file with spaces & special@chars.ts';
      await expect(
        diffManager.showDiff(specialPath, 'content'),
      ).resolves.not.toThrow();
    });
  });
});
