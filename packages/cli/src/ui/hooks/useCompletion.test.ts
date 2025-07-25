/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
<<<<<<< HEAD
import type { Mocked } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCompletion } from './useCompletion.js';
import * as fs from 'fs/promises';
import { glob } from 'glob';
import {
  CommandContext,
  CommandKind,
  SlashCommand,
} from '../commands/types.js';
import { Config, FileDiscoveryService } from '@google/gemini-cli-core';
import { useTextBuffer } from '../components/shared/text-buffer.js';

// Helper to create real TextBuffer objects within renderHook
const useTextBufferForTest = (text: string) => {
  const cursorOffset = text.length;

  return useTextBuffer({
    initialText: text,
    initialCursorOffset: cursorOffset,
    viewport: { width: 80, height: 20 },
    isValidPath: () => false,
    onChange: () => {},
  });
};

// Mock dependencies
vi.mock('fs/promises');
vi.mock('glob');
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    FileDiscoveryService: vi.fn(),
    isNodeError: vi.fn((error) => error.code === 'ENOENT'),
    escapePath: vi.fn((path) => path),
    unescapePath: vi.fn((path) => path),
    getErrorMessage: vi.fn((error) => error.message),
  };
});
vi.mock('glob');

describe('useCompletion', () => {
  let mockFileDiscoveryService: Mocked<FileDiscoveryService>;
  let mockConfig: Mocked<Config>;
  let mockCommandContext: CommandContext;
  let mockSlashCommands: SlashCommand[];

  const testCwd = '/test/project';

  beforeEach(() => {
    mockFileDiscoveryService = {
      shouldGitIgnoreFile: vi.fn(),
      shouldGeminiIgnoreFile: vi.fn(),
      shouldIgnoreFile: vi.fn(),
      filterFiles: vi.fn(),
      getGeminiIgnorePatterns: vi.fn(),
      projectRoot: '',
      gitIgnoreFilter: null,
      geminiIgnoreFilter: null,
    } as unknown as Mocked<FileDiscoveryService>;

    mockConfig = {
      getFileFilteringRespectGitIgnore: vi.fn(() => true),
      getFileService: vi.fn().mockReturnValue(mockFileDiscoveryService),
      getEnableRecursiveFileSearch: vi.fn(() => true),
=======
import { renderHook, act } from '@testing-library/react';
import { useCompletion } from './useCompletion.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CommandContext, SlashCommand } from '../commands/types.js';
import { Config, FileDiscoveryService } from '@google/gemini-cli-core';
import { useTextBuffer, TextBuffer } from '../components/shared/text-buffer.js';

describe('useCompletion', () => {
  let testRootDir: string;
  let mockConfig: Config;

  // A minimal mock is sufficient for these tests.
  const mockCommandContext = {} as CommandContext;

  async function createEmptyDir(...pathSegments: string[]) {
    const fullPath = path.join(testRootDir, ...pathSegments);
    await fs.mkdir(fullPath, { recursive: true });
    return fullPath;
  }

  async function createTestFile(content: string, ...pathSegments: string[]) {
    const fullPath = path.join(testRootDir, ...pathSegments);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
    return fullPath;
  }

  // Helper to create real TextBuffer objects within renderHook
  function useTextBufferForTest(text: string) {
    return useTextBuffer({
      initialText: text,
      initialCursorOffset: text.length,
      viewport: { width: 80, height: 20 },
      isValidPath: () => false,
      onChange: () => {},
    });
  }

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'completion-unit-test-'),
    );
    mockConfig = {
      getTargetDir: () => testRootDir,
      getProjectRoot: () => testRootDir,
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49
      getFileFilteringOptions: vi.fn(() => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      })),
<<<<<<< HEAD
    } as unknown as Mocked<Config>;

    mockCommandContext = {} as CommandContext;

    mockSlashCommands = [
      {
        name: 'help',
        altNames: ['?'],
        description: 'Show help',
        action: vi.fn(),
        kind: CommandKind.BUILT_IN,
      },
      {
        name: 'stats',
        altNames: ['usage'],
        description: 'check session stats. Usage: /stats [model|tools]',
        action: vi.fn(),
        kind: CommandKind.BUILT_IN,
      },
      {
        name: 'clear',
        description: 'Clear the screen',
        action: vi.fn(),
        kind: CommandKind.BUILT_IN,
      },
      {
        name: 'memory',
        description: 'Manage memory',
        kind: CommandKind.BUILT_IN,
        subCommands: [
          {
            name: 'show',
            description: 'Show memory',
            kind: CommandKind.BUILT_IN,
            action: vi.fn(),
          },
          {
            name: 'add',
            description: 'Add to memory',
            kind: CommandKind.BUILT_IN,
            action: vi.fn(),
          },
        ],
      },
      {
        name: 'chat',
        description: 'Manage chat history',
        kind: CommandKind.BUILT_IN,
        subCommands: [
          {
            name: 'save',
            description: 'Save chat',
            kind: CommandKind.BUILT_IN,

            action: vi.fn(),
          },
          {
            name: 'resume',
            description: 'Resume a saved chat',
            kind: CommandKind.BUILT_IN,

            action: vi.fn(),
            completion: vi.fn().mockResolvedValue(['chat1', 'chat2']),
          },
        ],
      },
    ];
=======
      getEnableRecursiveFileSearch: vi.fn(() => true),
      getFileService: vi.fn(() => new FileDiscoveryService(testRootDir)),
    } as unknown as Config;
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49

    vi.clearAllMocks();
  });

<<<<<<< HEAD
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Hook initialization and state', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.activeSuggestionIndex).toBe(-1);
      expect(result.current.visibleStartIndex).toBe(0);
      expect(result.current.showSuggestions).toBe(false);
      expect(result.current.isLoadingSuggestions).toBe(false);
    });

    it('should reset state when query becomes inactive', () => {
      const { result, rerender } = renderHook(
        ({ text }) => {
          const textBuffer = useTextBufferForTest(text);
          return useCompletion(
            textBuffer,
            testCwd,
            mockSlashCommands,
            mockCommandContext,
            mockConfig,
          );
        },
        { initialProps: { text: '/help' } },
      );

      // Inactive because of the leading space
      rerender({ text: ' /help' });

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.activeSuggestionIndex).toBe(-1);
      expect(result.current.visibleStartIndex).toBe(0);
      expect(result.current.showSuggestions).toBe(false);
      expect(result.current.isLoadingSuggestions).toBe(false);
    });

    it('should provide required functions', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(typeof result.current.setActiveSuggestionIndex).toBe('function');
      expect(typeof result.current.setShowSuggestions).toBe('function');
      expect(typeof result.current.resetCompletionState).toBe('function');
      expect(typeof result.current.navigateUp).toBe('function');
      expect(typeof result.current.navigateDown).toBe('function');
    });
  });

  describe('resetCompletionState', () => {
    it('should reset all state to default values', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/help');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      act(() => {
        result.current.setActiveSuggestionIndex(5);
        result.current.setShowSuggestions(true);
      });

      act(() => {
        result.current.resetCompletionState();
      });

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.activeSuggestionIndex).toBe(-1);
      expect(result.current.visibleStartIndex).toBe(0);
      expect(result.current.showSuggestions).toBe(false);
      expect(result.current.isLoadingSuggestions).toBe(false);
    });
  });

  describe('Navigation functions', () => {
    it('should handle navigateUp with no suggestions', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      act(() => {
        result.current.navigateUp();
      });

      expect(result.current.activeSuggestionIndex).toBe(-1);
    });

    it('should handle navigateDown with no suggestions', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      act(() => {
        result.current.navigateDown();
      });

      expect(result.current.activeSuggestionIndex).toBe(-1);
    });

    it('should navigate up through suggestions with wrap-around', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/h');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions.length).toBe(1);
      expect(result.current.activeSuggestionIndex).toBe(0);

      act(() => {
        result.current.navigateUp();
      });

      expect(result.current.activeSuggestionIndex).toBe(0);
    });

    it('should navigate down through suggestions with wrap-around', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/h');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions.length).toBe(1);
      expect(result.current.activeSuggestionIndex).toBe(0);

      act(() => {
        result.current.navigateDown();
      });

      expect(result.current.activeSuggestionIndex).toBe(0);
    });

    it('should handle navigation with multiple suggestions', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions.length).toBe(5);
      expect(result.current.activeSuggestionIndex).toBe(0);

      act(() => {
        result.current.navigateDown();
      });
      expect(result.current.activeSuggestionIndex).toBe(1);

      act(() => {
        result.current.navigateDown();
      });
      expect(result.current.activeSuggestionIndex).toBe(2);

      act(() => {
        result.current.navigateUp();
      });
      expect(result.current.activeSuggestionIndex).toBe(1);

      act(() => {
        result.current.navigateUp();
      });
      expect(result.current.activeSuggestionIndex).toBe(0);

      act(() => {
        result.current.navigateUp();
      });
      expect(result.current.activeSuggestionIndex).toBe(4);
    });

    it('should handle navigation with large suggestion lists and scrolling', () => {
      const largeMockCommands = Array.from({ length: 15 }, (_, i) => ({
        name: `command${i}`,
        description: `Command ${i}`,
        kind: CommandKind.BUILT_IN,
        action: vi.fn(),
      }));

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/command');
        return useCompletion(
          textBuffer,
          testCwd,
          largeMockCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions.length).toBe(15);
      expect(result.current.activeSuggestionIndex).toBe(0);
      expect(result.current.visibleStartIndex).toBe(0);

      act(() => {
        result.current.navigateUp();
      });

      expect(result.current.activeSuggestionIndex).toBe(14);
      expect(result.current.visibleStartIndex).toBe(Math.max(0, 15 - 8));
    });
  });

  describe('Slash command completion', () => {
    it('should show all commands for root slash', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions).toHaveLength(5);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['help', 'clear', 'memory', 'chat', 'stats']),
      );
      expect(result.current.showSuggestions).toBe(true);
      expect(result.current.activeSuggestionIndex).toBe(0);
    });

    it('should filter commands by prefix', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/h');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('help');
      expect(result.current.suggestions[0].description).toBe('Show help');
    });

    it.each([['/?'], ['/usage']])(
      'should not suggest commands when altNames is fully typed',
      (altName) => {
        const { result } = renderHook(() => {
          const textBuffer = useTextBufferForTest(altName);
          return useCompletion(
            textBuffer,
            testCwd,
            mockSlashCommands,
            mockCommandContext,
            mockConfig,
          );
        });

        expect(result.current.suggestions).toHaveLength(0);
      },
    );

    it('should suggest commands based on partial altNames matches', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/usag'); // part of the word "usage"
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('stats');
    });

    it('should not show suggestions for exact leaf command match', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/clear');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });

    it('should show sub-commands for parent commands', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/memory');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['show', 'add']),
      );
    });

    it('should show all sub-commands after parent command with space', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/memory ');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['show', 'add']),
      );
    });

    it('should filter sub-commands by prefix', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/memory a');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('add');
    });

    it('should handle unknown command gracefully', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/unknown');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });
  });

  describe('Command argument completion', () => {
    it('should call completion function for command arguments', async () => {
      const completionFn = vi.fn().mockResolvedValue(['arg1', 'arg2']);
      const commandsWithCompletion = [...mockSlashCommands];
      const chatCommand = commandsWithCompletion.find(
        (cmd) => cmd.name === 'chat',
      );
      const resumeCommand = chatCommand?.subCommands?.find(
        (cmd) => cmd.name === 'resume',
      );
      if (resumeCommand) {
        resumeCommand.completion = completionFn;
      }

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/chat resume ');
        return useCompletion(
          textBuffer,
          testCwd,
          commandsWithCompletion,
          mockCommandContext,
          mockConfig,
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(completionFn).toHaveBeenCalledWith(mockCommandContext, '');
      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual([
        'arg1',
        'arg2',
      ]);
    });

    it('should call completion function with partial argument', async () => {
      const completionFn = vi.fn().mockResolvedValue(['arg1', 'arg2']);
      const commandsWithCompletion = [...mockSlashCommands];
      const chatCommand = commandsWithCompletion.find(
        (cmd) => cmd.name === 'chat',
      );
      const resumeCommand = chatCommand?.subCommands?.find(
        (cmd) => cmd.name === 'resume',
      );
      if (resumeCommand) {
        resumeCommand.completion = completionFn;
      }

      renderHook(() => {
        const textBuffer = useTextBufferForTest('/chat resume ar');
        return useCompletion(
          textBuffer,
          testCwd,
          commandsWithCompletion,
          mockCommandContext,
          mockConfig,
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(completionFn).toHaveBeenCalledWith(mockCommandContext, 'ar');
    });

    it('should handle completion function that returns null', async () => {
      const completionFn = vi.fn().mockResolvedValue(null);
      const commandsWithCompletion = [...mockSlashCommands];
      const chatCommand = commandsWithCompletion.find(
        (cmd) => cmd.name === 'chat',
      );
      const resumeCommand = chatCommand?.subCommands?.find(
        (cmd) => cmd.name === 'resume',
      );
      if (resumeCommand) {
        resumeCommand.completion = completionFn;
      }

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/chat resume ');
        return useCompletion(
          textBuffer,
          testCwd,
          commandsWithCompletion,
          mockCommandContext,
          mockConfig,
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });
  });

  describe('Slash command completion with namespaced names', () => {
    let commandsWithNamespaces: SlashCommand[];

    beforeEach(() => {
      commandsWithNamespaces = [
        ...mockSlashCommands,
        {
          name: 'git:commit',
          description: 'A namespaced git command',
          kind: CommandKind.FILE,
          action: vi.fn(),
        },
        {
          name: 'git:push',
          description: 'Another namespaced git command',
          kind: CommandKind.FILE,
          action: vi.fn(),
        },
        {
          name: 'docker:build',
          description: 'A docker command',
          kind: CommandKind.FILE,
          action: vi.fn(),
        },
      ];
    });

    it('should suggest a namespaced command based on a partial match', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/git:co');
        return useCompletion(
          textBuffer,
          testCwd,
          commandsWithNamespaces,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('git:commit');
    });

    it('should suggest all commands within a namespace when the namespace prefix is typed', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/git:');
        return useCompletion(
          textBuffer,
          testCwd,
          commandsWithNamespaces,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['git:commit', 'git:push']),
      );

      expect(result.current.suggestions.map((s) => s.label)).not.toContain(
        'docker:build',
      );
    });

    it('should not provide suggestions if the namespaced command is a perfect leaf match', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('/git:commit');
        return useCompletion(
          textBuffer,
          testCwd,
          commandsWithNamespaces,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.showSuggestions).toBe(false);
      expect(result.current.suggestions).toHaveLength(0);
    });
  });

  describe('File path completion (@-syntax)', () => {
    beforeEach(() => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file1.txt', isDirectory: () => false },
        { name: 'file2.js', isDirectory: () => false },
        { name: 'folder1', isDirectory: () => true },
        { name: '.hidden', isDirectory: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
    });

    it('should show file completions for @ prefix', async () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('@');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(3);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['file1.txt', 'file2.js', 'folder1/']),
      );
    });

    it('should filter files by prefix', async () => {
      // Mock for recursive search since enableRecursiveFileSearch is true
      vi.mocked(glob).mockResolvedValue([
        `${testCwd}/file1.txt`,
        `${testCwd}/file2.js`,
      ]);

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('@file');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['file1.txt', 'file2.js']),
      );
    });

    it('should include hidden files when prefix starts with dot', async () => {
      // Mock for recursive search since enableRecursiveFileSearch is true
      vi.mocked(glob).mockResolvedValue([`${testCwd}/.hidden`]);

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('@.');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('.hidden');
    });

    it('should handle ENOENT error gracefully', async () => {
      const enoentError = new Error('No such file or directory');
      (enoentError as Error & { code: string }).code = 'ENOENT';
      vi.mocked(fs.readdir).mockRejectedValue(enoentError);

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('@nonexistent');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });

    it('should handle other errors by resetting state', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'));

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('@');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
      expect(result.current.isLoadingSuggestions).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Debouncing', () => {
    it('should debounce file completion requests', async () => {
      // Mock for recursive search since enableRecursiveFileSearch is true
      vi.mocked(glob).mockResolvedValue([`${testCwd}/file1.txt`]);

      const { rerender } = renderHook(
        ({ text }) => {
          const textBuffer = useTextBufferForTest(text);
          return useCompletion(
            textBuffer,
            testCwd,
            mockSlashCommands,
            mockCommandContext,
            mockConfig,
          );
        },
        { initialProps: { text: '@f' } },
      );

      rerender({ text: '@fi' });
      rerender({ text: '@fil' });
      rerender({ text: '@file' });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(glob).toHaveBeenCalledTimes(1);
    });
  });

  describe('Query handling edge cases', () => {
    it('should handle empty query', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });

    it('should handle query without slash or @', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('regular text');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });

    it('should handle query with whitespace', () => {
      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('   /hel');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('help');
    });

    it('should handle @ at the end of query', async () => {
      // Mock for recursive search since enableRecursiveFileSearch is true
      vi.mocked(glob).mockResolvedValue([`${testCwd}/file1.txt`]);

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('some text @');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      // Wait for completion
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      // Should process the @ query and get suggestions
      expect(result.current.isLoadingSuggestions).toBe(false);
      expect(result.current.suggestions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('File sorting behavior', () => {
    it('should prioritize source files over test files with same base name', async () => {
      // Mock glob to return files with same base name but different extensions
      vi.mocked(glob).mockResolvedValue([
        `${testCwd}/component.test.ts`,
        `${testCwd}/component.ts`,
        `${testCwd}/utils.spec.js`,
        `${testCwd}/utils.js`,
        `${testCwd}/api.test.tsx`,
        `${testCwd}/api.tsx`,
      ]);

      mockFileDiscoveryService.shouldIgnoreFile.mockReturnValue(false);

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('@comp');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(6);

      // Extract labels for easier testing
      const labels = result.current.suggestions.map((s) => s.label);

      // Verify the exact sorted order: source files should come before their test counterparts
      expect(labels).toEqual([
        'api.tsx',
        'api.test.tsx',
        'component.ts',
        'component.test.ts',
        'utils.js',
        'utils.spec.js',
      ]);
=======
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  describe('Core Hook Behavior', () => {
    describe('State Management', () => {
      it('should initialize with default state', () => {
        const slashCommands = [
          { name: 'dummy', description: 'dummy' },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest(''),
            testRootDir,
            slashCommands,
            mockCommandContext,
            mockConfig,
          ),
        );

        expect(result.current.suggestions).toEqual([]);
        expect(result.current.activeSuggestionIndex).toBe(-1);
        expect(result.current.visibleStartIndex).toBe(0);
        expect(result.current.showSuggestions).toBe(false);
        expect(result.current.isLoadingSuggestions).toBe(false);
      });

      it('should reset state when isActive becomes false', () => {
        const slashCommands = [
          {
            name: 'help',
            altNames: ['?'],
            description: 'Show help',
            action: vi.fn(),
          },
        ] as unknown as SlashCommand[];

        const { result, rerender } = renderHook(
          ({ text }) => {
            const textBuffer = useTextBufferForTest(text);
            return useCompletion(
              textBuffer,
              testRootDir,
              slashCommands,
              mockCommandContext,
              mockConfig,
            );
          },
          { initialProps: { text: '/help' } },
        );

        // Inactive because of the leading space
        rerender({ text: ' /help' });

        expect(result.current.suggestions).toEqual([]);
        expect(result.current.activeSuggestionIndex).toBe(-1);
        expect(result.current.visibleStartIndex).toBe(0);
        expect(result.current.showSuggestions).toBe(false);
        expect(result.current.isLoadingSuggestions).toBe(false);
      });

      it('should reset all state to default values', () => {
        const slashCommands = [
          {
            name: 'help',
            description: 'Show help',
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/help'),
            testRootDir,
            slashCommands,
            mockCommandContext,
            mockConfig,
          ),
        );

        act(() => {
          result.current.setActiveSuggestionIndex(5);
          result.current.setShowSuggestions(true);
        });

        act(() => {
          result.current.resetCompletionState();
        });

        expect(result.current.suggestions).toEqual([]);
        expect(result.current.activeSuggestionIndex).toBe(-1);
        expect(result.current.visibleStartIndex).toBe(0);
        expect(result.current.showSuggestions).toBe(false);
        expect(result.current.isLoadingSuggestions).toBe(false);
      });
    });

    describe('Navigation', () => {
      it('should handle navigateUp with no suggestions', () => {
        const slashCommands = [
          { name: 'dummy', description: 'dummy' },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest(''),
            testRootDir,
            slashCommands,
            mockCommandContext,
            mockConfig,
          ),
        );

        act(() => {
          result.current.navigateUp();
        });

        expect(result.current.activeSuggestionIndex).toBe(-1);
      });

      it('should handle navigateDown with no suggestions', () => {
        const slashCommands = [
          { name: 'dummy', description: 'dummy' },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest(''),
            testRootDir,
            slashCommands,
            mockCommandContext,
            mockConfig,
          ),
        );

        act(() => {
          result.current.navigateDown();
        });

        expect(result.current.activeSuggestionIndex).toBe(-1);
      });

      it('should navigate up through suggestions with wrap-around', () => {
        const slashCommands = [
          {
            name: 'help',
            description: 'Show help',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/h'),
            testRootDir,
            slashCommands,
            mockCommandContext,
            mockConfig,
          ),
        );

        expect(result.current.suggestions.length).toBe(1);
        expect(result.current.activeSuggestionIndex).toBe(0);

        act(() => {
          result.current.navigateUp();
        });

        expect(result.current.activeSuggestionIndex).toBe(0);
      });

      it('should navigate down through suggestions with wrap-around', () => {
        const slashCommands = [
          {
            name: 'help',
            description: 'Show help',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/h'),
            testRootDir,
            slashCommands,
            mockCommandContext,
            mockConfig,
          ),
        );

        expect(result.current.suggestions.length).toBe(1);
        expect(result.current.activeSuggestionIndex).toBe(0);

        act(() => {
          result.current.navigateDown();
        });

        expect(result.current.activeSuggestionIndex).toBe(0);
      });

      it('should handle navigation with multiple suggestions', () => {
        const slashCommands = [
          { name: 'help', description: 'Show help' },
          { name: 'stats', description: 'Show stats' },
          { name: 'clear', description: 'Clear screen' },
          { name: 'memory', description: 'Manage memory' },
          { name: 'chat', description: 'Manage chat' },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/'),
            testRootDir,
            slashCommands,
            mockCommandContext,
            mockConfig,
          ),
        );

        expect(result.current.suggestions.length).toBe(5);
        expect(result.current.activeSuggestionIndex).toBe(0);

        act(() => {
          result.current.navigateDown();
        });
        expect(result.current.activeSuggestionIndex).toBe(1);

        act(() => {
          result.current.navigateDown();
        });
        expect(result.current.activeSuggestionIndex).toBe(2);

        act(() => {
          result.current.navigateUp();
        });
        expect(result.current.activeSuggestionIndex).toBe(1);

        act(() => {
          result.current.navigateUp();
        });
        expect(result.current.activeSuggestionIndex).toBe(0);

        act(() => {
          result.current.navigateUp();
        });
        expect(result.current.activeSuggestionIndex).toBe(4);
      });

      it('should handle navigation with large suggestion lists and scrolling', () => {
        const largeMockCommands = Array.from({ length: 15 }, (_, i) => ({
          name: `command${i}`,
          description: `Command ${i}`,
        })) as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/command'),
            testRootDir,
            largeMockCommands,
            mockCommandContext,
            mockConfig,
          ),
        );

        expect(result.current.suggestions.length).toBe(15);
        expect(result.current.activeSuggestionIndex).toBe(0);
        expect(result.current.visibleStartIndex).toBe(0);

        act(() => {
          result.current.navigateUp();
        });

        expect(result.current.activeSuggestionIndex).toBe(14);
        expect(result.current.visibleStartIndex).toBe(Math.max(0, 15 - 8));
      });
    });
  });

  describe('Slash Command Completion (`/`)', () => {
    describe('Top-Level Commands', () => {
      it('should suggest all top-level commands for the root slash', async () => {
        const slashCommands = [
          {
            name: 'help',
            altNames: ['?'],
            description: 'Show help',
          },
          {
            name: 'stats',
            altNames: ['usage'],
            description: 'check session stats. Usage: /stats [model|tools]',
          },
          {
            name: 'clear',
            description: 'Clear the screen',
          },
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
            ],
          },
          {
            name: 'chat',
            description: 'Manage chat history',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/'),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions.length).toBe(slashCommands.length);
        expect(result.current.suggestions.map((s) => s.label)).toEqual(
          expect.arrayContaining(['help', 'clear', 'memory', 'chat', 'stats']),
        );
      });

      it('should filter commands based on partial input', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/mem'),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toEqual([
          { label: 'memory', value: 'memory', description: 'Manage memory' },
        ]);
        expect(result.current.showSuggestions).toBe(true);
      });

      it('should suggest commands based on partial altNames', async () => {
        const slashCommands = [
          {
            name: 'stats',
            altNames: ['usage'],
            description: 'check session stats. Usage: /stats [model|tools]',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/usag'), // part of the word "usage"
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toEqual([
          {
            label: 'stats',
            value: 'stats',
            description: 'check session stats. Usage: /stats [model|tools]',
          },
        ]);
      });

      it('should NOT provide suggestions for a perfectly typed command that is a leaf node', async () => {
        const slashCommands = [
          {
            name: 'clear',
            description: 'Clear the screen',
            action: vi.fn(),
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/clear'), // No trailing space
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.showSuggestions).toBe(false);
      });

      it.each([['/?'], ['/usage']])(
        'should not suggest commands when altNames is fully typed',
        async (query) => {
          const mockSlashCommands = [
            {
              name: 'help',
              altNames: ['?'],
              description: 'Show help',
              action: vi.fn(),
            },
            {
              name: 'stats',
              altNames: ['usage'],
              description: 'check session stats. Usage: /stats [model|tools]',
              action: vi.fn(),
            },
          ] as unknown as SlashCommand[];

          const { result } = renderHook(() =>
            useCompletion(
              useTextBufferForTest(query),
              testRootDir,
              mockSlashCommands,
              mockCommandContext,
            ),
          );

          expect(result.current.suggestions).toHaveLength(0);
        },
      );

      it('should not provide suggestions for a fully typed command that has no sub-commands or argument completion', async () => {
        const slashCommands = [
          {
            name: 'clear',
            description: 'Clear the screen',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/clear '),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.showSuggestions).toBe(false);
      });

      it('should not provide suggestions for an unknown command', async () => {
        const slashCommands = [
          {
            name: 'help',
            description: 'Show help',
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/unknown-command'),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.showSuggestions).toBe(false);
      });
    });

    describe('Sub-Commands', () => {
      it('should suggest sub-commands for a parent command', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
              {
                name: 'add',
                description: 'Add to memory',
              },
            ],
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/memory'), // Note: no trailing space
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        // Assert that suggestions for sub-commands are shown immediately
        expect(result.current.suggestions).toHaveLength(2);
        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([
            { label: 'show', value: 'show', description: 'Show memory' },
            { label: 'add', value: 'add', description: 'Add to memory' },
          ]),
        );
        expect(result.current.showSuggestions).toBe(true);
      });

      it('should suggest all sub-commands when the query ends with the parent command and a space', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
              {
                name: 'add',
                description: 'Add to memory',
              },
            ],
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/memory'),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(2);
        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([
            { label: 'show', value: 'show', description: 'Show memory' },
            { label: 'add', value: 'add', description: 'Add to memory' },
          ]),
        );
      });

      it('should filter sub-commands by prefix', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
              {
                name: 'add',
                description: 'Add to memory',
              },
            ],
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/memory a'),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toEqual([
          { label: 'add', value: 'add', description: 'Add to memory' },
        ]);
      });

      it('should provide no suggestions for an invalid sub-command', async () => {
        const slashCommands = [
          {
            name: 'memory',
            description: 'Manage memory',
            subCommands: [
              {
                name: 'show',
                description: 'Show memory',
              },
              {
                name: 'add',
                description: 'Add to memory',
              },
            ],
          },
        ] as unknown as SlashCommand[];
        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/memory dothisnow'),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.showSuggestions).toBe(false);
      });
    });

    describe('Argument Completion', () => {
      it('should call the command.completion function for argument suggestions', async () => {
        const availableTags = [
          'my-chat-tag-1',
          'my-chat-tag-2',
          'another-channel',
        ];
        const mockCompletionFn = vi
          .fn()
          .mockImplementation(
            async (_context: CommandContext, partialArg: string) =>
              availableTags.filter((tag) => tag.startsWith(partialArg)),
          );

        const slashCommands = [
          {
            name: 'chat',
            description: 'Manage chat history',
            subCommands: [
              {
                name: 'resume',
                description: 'Resume a saved chat',
                completion: mockCompletionFn,
              },
            ],
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/chat resume my-ch'),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        expect(mockCompletionFn).toHaveBeenCalledWith(
          mockCommandContext,
          'my-ch',
        );

        expect(result.current.suggestions).toEqual([
          { label: 'my-chat-tag-1', value: 'my-chat-tag-1' },
          { label: 'my-chat-tag-2', value: 'my-chat-tag-2' },
        ]);
      });

      it('should call command.completion with an empty string when args start with a space', async () => {
        const mockCompletionFn = vi
          .fn()
          .mockResolvedValue(['my-chat-tag-1', 'my-chat-tag-2', 'my-channel']);

        const slashCommands = [
          {
            name: 'chat',
            description: 'Manage chat history',
            subCommands: [
              {
                name: 'resume',
                description: 'Resume a saved chat',
                completion: mockCompletionFn,
              },
            ],
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/chat resume '),
            testRootDir,
            slashCommands,
            mockCommandContext,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        expect(mockCompletionFn).toHaveBeenCalledWith(mockCommandContext, '');
        expect(result.current.suggestions).toHaveLength(3);
        expect(result.current.showSuggestions).toBe(true);
      });

      it('should handle completion function that returns null', async () => {
        const completionFn = vi.fn().mockResolvedValue(null);
        const slashCommands = [
          {
            name: 'chat',
            description: 'Manage chat history',
            subCommands: [
              {
                name: 'resume',
                description: 'Resume a saved chat',
                completion: completionFn,
              },
            ],
          },
        ] as unknown as SlashCommand[];

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('/chat resume '),
            testRootDir,
            slashCommands,
            mockCommandContext,
            mockConfig,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        expect(result.current.suggestions).toHaveLength(0);
        expect(result.current.showSuggestions).toBe(false);
      });
    });
  });

  describe('File Path Completion (`@`)', () => {
    describe('Basic Completion', () => {
      it('should use glob for top-level @ completions when available', async () => {
        await createTestFile('', 'src', 'index.ts');
        await createTestFile('', 'derp', 'script.ts');
        await createTestFile('', 'README.md');

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('@s'),
            testRootDir,
            [],
            mockCommandContext,
            mockConfig,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        expect(result.current.suggestions).toHaveLength(2);
        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([
            {
              label: 'derp/script.ts',
              value: 'derp/script.ts',
            },
            { label: 'src', value: 'src' },
          ]),
        );
      });

      it('should handle directory-specific completions with git filtering', async () => {
        await createEmptyDir('.git');
        await createTestFile('*.log', '.gitignore');
        await createTestFile('', 'src', 'component.tsx');
        await createTestFile('', 'src', 'temp.log');
        await createTestFile('', 'src', 'index.ts');

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('@src/comp'),
            testRootDir,
            [],
            mockCommandContext,
            mockConfig,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        // Should filter out .log files but include matching .tsx files
        expect(result.current.suggestions).toEqual([
          { label: 'component.tsx', value: 'component.tsx' },
        ]);
      });

      it('should include dotfiles in glob search when input starts with a dot', async () => {
        await createTestFile('', '.env');
        await createTestFile('', '.gitignore');
        await createTestFile('', 'src', 'index.ts');

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('@.'),
            testRootDir,
            [],
            mockCommandContext,
            mockConfig,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        expect(result.current.suggestions).toEqual([
          { label: '.env', value: '.env' },
          { label: '.gitignore', value: '.gitignore' },
        ]);
      });
    });

    describe('Configuration-based Behavior', () => {
      it('should not perform recursive search when disabled in config', async () => {
        const mockConfigNoRecursive = {
          ...mockConfig,
          getEnableRecursiveFileSearch: vi.fn(() => false),
        } as unknown as Config;

        await createEmptyDir('data');
        await createEmptyDir('dist');

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('@d'),
            testRootDir,
            [],
            mockCommandContext,
            mockConfigNoRecursive,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        expect(result.current.suggestions).toEqual([
          { label: 'data/', value: 'data/' },
          { label: 'dist/', value: 'dist/' },
        ]);
      });

      it('should work without config (fallback behavior)', async () => {
        await createEmptyDir('src');
        await createEmptyDir('node_modules');
        await createTestFile('', 'README.md');

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('@'),
            testRootDir,
            [],
            mockCommandContext,
            undefined,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        // Without config, should include all files
        expect(result.current.suggestions).toHaveLength(3);
        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([
            { label: 'src/', value: 'src/' },
            { label: 'node_modules/', value: 'node_modules/' },
            { label: 'README.md', value: 'README.md' },
          ]),
        );
      });

      it('should handle git discovery service initialization failure gracefully', async () => {
        // Intentionally don't create a .git directory to cause an initialization failure.
        await createEmptyDir('src');
        await createTestFile('', 'README.md');

        const consoleSpy = vi
          .spyOn(console, 'warn')
          .mockImplementation(() => {});

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('@'),
            testRootDir,
            [],
            mockCommandContext,
            mockConfig,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        // Since we use centralized service, initialization errors are handled at config level
        // This test should verify graceful fallback behavior
        expect(result.current.suggestions.length).toBeGreaterThanOrEqual(0);
        // Should still show completions even if git discovery fails
        expect(result.current.suggestions.length).toBeGreaterThan(0);

        consoleSpy.mockRestore();
      });
    });

    describe('Git-Aware Filtering', () => {
      it('should filter git-ignored entries from @ completions', async () => {
        await createEmptyDir('.git');
        await createTestFile('dist', '.gitignore');
        await createEmptyDir('data');

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('@d'),
            testRootDir,
            [],
            mockCommandContext,
            mockConfig,
          ),
        );

        // Wait for async operations to complete
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150)); // Account for debounce
        });

        expect(result.current.suggestions).toEqual(
          expect.arrayContaining([{ label: 'data', value: 'data' }]),
        );
        expect(result.current.showSuggestions).toBe(true);
      });

      it('should filter git-ignored directories from @ completions', async () => {
        await createEmptyDir('.git');
        await createTestFile('node_modules\ndist\n.env', '.gitignore');
        // gitignored entries
        await createEmptyDir('node_modules');
        await createEmptyDir('dist');
        await createTestFile('', '.env');

        // visible
        await createEmptyDir('src');
        await createTestFile('', 'README.md');

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('@'),
            testRootDir,
            [],
            mockCommandContext,
            mockConfig,
          ),
        );

        // Wait for async operations to complete
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150)); // Account for debounce
        });

        expect(result.current.suggestions).toEqual([
          { label: 'README.md', value: 'README.md' },
          { label: 'src/', value: 'src/' },
        ]);
        expect(result.current.showSuggestions).toBe(true);
      });

      it('should handle recursive search with git-aware filtering', async () => {
        await createEmptyDir('.git');
        await createTestFile('node_modules/\ntemp/', '.gitignore');
        await createTestFile('', 'data', 'test.txt');
        await createEmptyDir('dist');
        await createEmptyDir('node_modules');
        await createTestFile('', 'src', 'index.ts');
        await createEmptyDir('src', 'components');
        await createTestFile('', 'temp', 'temp.log');

        const { result } = renderHook(() =>
          useCompletion(
            useTextBufferForTest('@t'),
            testRootDir,
            [],
            mockCommandContext,
            mockConfig,
          ),
        );

        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
        });

        // Should not include anything from node_modules or dist
        const suggestionLabels = result.current.suggestions.map((s) => s.label);
        expect(suggestionLabels).not.toContain('temp/');
        expect(suggestionLabels).not.toContain('node_modules/');
      });
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49
    });
  });

  describe('handleAutocomplete', () => {
    it('should complete a partial command', () => {
<<<<<<< HEAD
      // Create a mock buffer that we can spy on directly
      const mockBuffer = {
        text: '/mem',
        lines: ['/mem'],
        cursor: [0, 4],
        preferredCol: null,
        selectionAnchor: null,
        allVisualLines: ['/mem'],
        viewportVisualLines: ['/mem'],
        visualCursor: [0, 4],
        visualScrollRow: 0,
        setText: vi.fn(),
        insert: vi.fn(),
        newline: vi.fn(),
        backspace: vi.fn(),
        del: vi.fn(),
        move: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        replaceRange: vi.fn(),
        replaceRangeByOffset: vi.fn(),
        moveToOffset: vi.fn(),
        deleteWordLeft: vi.fn(),
        deleteWordRight: vi.fn(),
        killLineRight: vi.fn(),
        killLineLeft: vi.fn(),
        handleInput: vi.fn(),
        openInExternalEditor: vi.fn(),
      };
=======
      const slashCommands = [
        {
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            {
              name: 'show',
              description: 'Show memory',
            },
            {
              name: 'add',
              description: 'Add to memory',
            },
          ],
        },
      ] as unknown as SlashCommand[];
      // Create a mock buffer that we can spy on directly
      const mockBuffer = {
        text: '/mem',
        setText: vi.fn(),
      } as unknown as TextBuffer;
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49

      const { result } = renderHook(() =>
        useCompletion(
          mockBuffer,
<<<<<<< HEAD
          testCwd,
          mockSlashCommands,
=======
          testRootDir,
          slashCommands,
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions.map((s) => s.value)).toEqual([
        'memory',
      ]);

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(mockBuffer.setText).toHaveBeenCalledWith('/memory');
    });

    it('should append a sub-command when the parent is complete', () => {
      const mockBuffer = {
<<<<<<< HEAD
        text: '/memory ',
        lines: ['/memory '],
        cursor: [0, 8],
        preferredCol: null,
        selectionAnchor: null,
        allVisualLines: ['/memory '],
        viewportVisualLines: ['/memory '],
        visualCursor: [0, 8],
        visualScrollRow: 0,
        setText: vi.fn(),
        insert: vi.fn(),
        newline: vi.fn(),
        backspace: vi.fn(),
        del: vi.fn(),
        move: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        replaceRange: vi.fn(),
        replaceRangeByOffset: vi.fn(),
        moveToOffset: vi.fn(),
        deleteWordLeft: vi.fn(),
        deleteWordRight: vi.fn(),
        killLineRight: vi.fn(),
        killLineLeft: vi.fn(),
        handleInput: vi.fn(),
        openInExternalEditor: vi.fn(),
      };
=======
        text: '/memory',
        setText: vi.fn(),
      } as unknown as TextBuffer;
      const slashCommands = [
        {
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            {
              name: 'show',
              description: 'Show memory',
            },
            {
              name: 'add',
              description: 'Add to memory',
            },
          ],
        },
      ] as unknown as SlashCommand[];
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49

      const { result } = renderHook(() =>
        useCompletion(
          mockBuffer,
<<<<<<< HEAD
          testCwd,
          mockSlashCommands,
=======
          testRootDir,
          slashCommands,
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49
          mockCommandContext,
          mockConfig,
        ),
      );

      // Suggestions are populated by useEffect
      expect(result.current.suggestions.map((s) => s.value)).toEqual([
        'show',
        'add',
      ]);

      act(() => {
        result.current.handleAutocomplete(1); // index 1 is 'add'
      });

      expect(mockBuffer.setText).toHaveBeenCalledWith('/memory add');
    });

    it('should complete a command with an alternative name', () => {
      const mockBuffer = {
        text: '/?',
<<<<<<< HEAD
        lines: ['/?'],
        cursor: [0, 2],
        preferredCol: null,
        selectionAnchor: null,
        allVisualLines: ['/?'],
        viewportVisualLines: ['/?'],
        visualCursor: [0, 2],
        visualScrollRow: 0,
        setText: vi.fn(),
        insert: vi.fn(),
        newline: vi.fn(),
        backspace: vi.fn(),
        del: vi.fn(),
        move: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        replaceRange: vi.fn(),
        replaceRangeByOffset: vi.fn(),
        moveToOffset: vi.fn(),
        deleteWordLeft: vi.fn(),
        deleteWordRight: vi.fn(),
        killLineRight: vi.fn(),
        killLineLeft: vi.fn(),
        handleInput: vi.fn(),
        openInExternalEditor: vi.fn(),
      };
=======
        setText: vi.fn(),
      } as unknown as TextBuffer;
      const slashCommands = [
        {
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            {
              name: 'show',
              description: 'Show memory',
            },
            {
              name: 'add',
              description: 'Add to memory',
            },
          ],
        },
      ] as unknown as SlashCommand[];
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49

      const { result } = renderHook(() =>
        useCompletion(
          mockBuffer,
<<<<<<< HEAD
          testCwd,
          mockSlashCommands,
=======
          testRootDir,
          slashCommands,
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49
          mockCommandContext,
          mockConfig,
        ),
      );

      result.current.suggestions.push({
        label: 'help',
        value: 'help',
        description: 'Show help',
      });

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(mockBuffer.setText).toHaveBeenCalledWith('/help');
    });

    it('should complete a file path', async () => {
      const mockBuffer = {
        text: '@src/fi',
        lines: ['@src/fi'],
        cursor: [0, 7],
<<<<<<< HEAD
        preferredCol: null,
        selectionAnchor: null,
        allVisualLines: ['@src/fi'],
        viewportVisualLines: ['@src/fi'],
        visualCursor: [0, 7],
        visualScrollRow: 0,
        setText: vi.fn(),
        insert: vi.fn(),
        newline: vi.fn(),
        backspace: vi.fn(),
        del: vi.fn(),
        move: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        replaceRange: vi.fn(),
        replaceRangeByOffset: vi.fn(),
        moveToOffset: vi.fn(),
        deleteWordLeft: vi.fn(),
        deleteWordRight: vi.fn(),
        killLineRight: vi.fn(),
        killLineLeft: vi.fn(),
        handleInput: vi.fn(),
        openInExternalEditor: vi.fn(),
      };
=======
        setText: vi.fn(),
        replaceRangeByOffset: vi.fn(),
      } as unknown as TextBuffer;
      const slashCommands = [
        {
          name: 'memory',
          description: 'Manage memory',
          subCommands: [
            {
              name: 'show',
              description: 'Show memory',
            },
            {
              name: 'add',
              description: 'Add to memory',
            },
          ],
        },
      ] as unknown as SlashCommand[];
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49

      const { result } = renderHook(() =>
        useCompletion(
          mockBuffer,
<<<<<<< HEAD
          testCwd,
          mockSlashCommands,
=======
          testRootDir,
          slashCommands,
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49
          mockCommandContext,
          mockConfig,
        ),
      );

      result.current.suggestions.push({
        label: 'file1.txt',
        value: 'file1.txt',
      });

      act(() => {
        result.current.handleAutocomplete(0);
      });

      expect(mockBuffer.replaceRangeByOffset).toHaveBeenCalledWith(
        5, // after '@src/'
        mockBuffer.text.length,
        'file1.txt',
      );
    });
  });
<<<<<<< HEAD

  describe('Config and FileDiscoveryService integration', () => {
    it('should work without config', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file1.txt', isDirectory: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('@');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          undefined,
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('file1.txt');
    });

    it('should respect file filtering when config is provided', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file1.txt', isDirectory: () => false },
        { name: 'ignored.log', isDirectory: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      mockFileDiscoveryService.shouldIgnoreFile.mockImplementation(
        (path: string) => path.includes('.log'),
      );

      const { result } = renderHook(() => {
        const textBuffer = useTextBufferForTest('@');
        return useCompletion(
          textBuffer,
          testCwd,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('file1.txt');
    });
  });
=======
>>>>>>> 1b8ba5ca6bf739e4100a1d313721988f953acb49
});
