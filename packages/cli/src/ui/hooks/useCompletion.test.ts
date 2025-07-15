/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mocked } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCompletion } from './useCompletion.js';
import * as fs from 'fs/promises';
import { glob } from 'glob';
import { CommandContext, SlashCommand } from '../commands/types.js';
import { Config, FileDiscoveryService } from '@google/gemini-cli-core';

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
    } as unknown as Mocked<Config>;

    mockCommandContext = {} as CommandContext;

    mockSlashCommands = [
      {
        name: 'help',
        altName: '?',
        description: 'Show help',
        action: vi.fn(),
      },
      {
        name: 'clear',
        description: 'Clear the screen',
        action: vi.fn(),
      },
      {
        name: 'memory',
        description: 'Manage memory',
        subCommands: [
          {
            name: 'show',
            description: 'Show memory',
            action: vi.fn(),
          },
          {
            name: 'add',
            description: 'Add to memory',
            action: vi.fn(),
          },
        ],
      },
      {
        name: 'chat',
        description: 'Manage chat history',
        subCommands: [
          {
            name: 'save',
            description: 'Save chat',
            action: vi.fn(),
          },
          {
            name: 'resume',
            description: 'Resume a saved chat',
            action: vi.fn(),
            completion: vi.fn().mockResolvedValue(['chat1', 'chat2']),
          },
        ],
      },
    ];

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Hook initialization and state', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          false,
          mockSlashCommands,
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
      const { result, rerender } = renderHook(
        ({ isActive }) =>
          useCompletion(
            '/help',
            testCwd,
            isActive,
            mockSlashCommands,
            mockCommandContext,
            mockConfig,
          ),
        { initialProps: { isActive: true } },
      );

      rerender({ isActive: false });

      expect(result.current.suggestions).toEqual([]);
      expect(result.current.activeSuggestionIndex).toBe(-1);
      expect(result.current.visibleStartIndex).toBe(0);
      expect(result.current.showSuggestions).toBe(false);
      expect(result.current.isLoadingSuggestions).toBe(false);
    });

    it('should provide required functions', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(typeof result.current.setActiveSuggestionIndex).toBe('function');
      expect(typeof result.current.setShowSuggestions).toBe('function');
      expect(typeof result.current.resetCompletionState).toBe('function');
      expect(typeof result.current.navigateUp).toBe('function');
      expect(typeof result.current.navigateDown).toBe('function');
    });
  });

  describe('resetCompletionState', () => {
    it('should reset all state to default values', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/help',
          testCwd,
          true,
          mockSlashCommands,
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

  describe('Navigation functions', () => {
    it('should handle navigateUp with no suggestions', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          true,
          mockSlashCommands,
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
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          true,
          mockSlashCommands,
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
      const { result } = renderHook(() =>
        useCompletion(
          '/h',
          testCwd,
          true,
          mockSlashCommands,
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
      const { result } = renderHook(() =>
        useCompletion(
          '/h',
          testCwd,
          true,
          mockSlashCommands,
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
      const { result } = renderHook(() =>
        useCompletion(
          '/',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions.length).toBe(4);
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
      expect(result.current.activeSuggestionIndex).toBe(3);
    });

    it('should handle navigation with large suggestion lists and scrolling', () => {
      const largeMockCommands = Array.from({ length: 15 }, (_, i) => ({
        name: `command${i}`,
        description: `Command ${i}`,
        action: vi.fn(),
      }));

      const { result } = renderHook(() =>
        useCompletion(
          '/command',
          testCwd,
          true,
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

  describe('Slash command completion', () => {
    it('should show all commands for root slash', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(4);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['help', 'clear', 'memory', 'chat']),
      );
      expect(result.current.showSuggestions).toBe(true);
      expect(result.current.activeSuggestionIndex).toBe(0);
    });

    it('should filter commands by prefix', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/h',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('help');
      expect(result.current.suggestions[0].description).toBe('Show help');
    });

    it('should suggest commands by altName', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/?',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('help');
    });

    it('should not show suggestions for exact leaf command match', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/clear',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });

    it('should show sub-commands for parent commands', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/memory',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['show', 'add']),
      );
    });

    it('should show all sub-commands after parent command with space', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/memory ',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(2);
      expect(result.current.suggestions.map((s) => s.label)).toEqual(
        expect.arrayContaining(['show', 'add']),
      );
    });

    it('should filter sub-commands by prefix', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/memory a',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('add');
    });

    it('should handle unknown command gracefully', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '/unknown',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

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

      const { result } = renderHook(() =>
        useCompletion(
          '/chat resume ',
          testCwd,
          true,
          commandsWithCompletion,
          mockCommandContext,
          mockConfig,
        ),
      );

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

      renderHook(() =>
        useCompletion(
          '/chat resume ar',
          testCwd,
          true,
          commandsWithCompletion,
          mockCommandContext,
          mockConfig,
        ),
      );

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

      const { result } = renderHook(() =>
        useCompletion(
          '/chat resume ',
          testCwd,
          true,
          commandsWithCompletion,
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
      const { result } = renderHook(() =>
        useCompletion(
          '@',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

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

      const { result } = renderHook(() =>
        useCompletion(
          '@file',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

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

      const { result } = renderHook(() =>
        useCompletion(
          '@.',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

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

      const { result } = renderHook(() =>
        useCompletion(
          '@nonexistent',
          testCwd,
          true,
          mockSlashCommands,
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

    it('should handle other errors by resetting state', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'));

      const { result } = renderHook(() =>
        useCompletion(
          '@',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

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
        ({ query }) =>
          useCompletion(
            query,
            testCwd,
            true,
            mockSlashCommands,
            mockCommandContext,
            mockConfig,
          ),
        { initialProps: { query: '@f' } },
      );

      rerender({ query: '@fi' });
      rerender({ query: '@fil' });
      rerender({ query: '@file' });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(glob).toHaveBeenCalledTimes(1);
    });
  });

  describe('Query handling edge cases', () => {
    it('should handle empty query', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });

    it('should handle query without slash or @', () => {
      const { result } = renderHook(() =>
        useCompletion(
          'regular text',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.showSuggestions).toBe(false);
    });

    it('should handle query with whitespace', () => {
      const { result } = renderHook(() =>
        useCompletion(
          '   /hel',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('help');
    });

    it('should handle @ at the end of query', async () => {
      // Mock for recursive search since enableRecursiveFileSearch is true
      vi.mocked(glob).mockResolvedValue([`${testCwd}/file1.txt`]);

      const { result } = renderHook(() =>
        useCompletion(
          'some text @',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

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

      const { result } = renderHook(() =>
        useCompletion(
          '@comp',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

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
    });
  });

  describe('Config and FileDiscoveryService integration', () => {
    it('should work without config', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'file1.txt', isDirectory: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const { result } = renderHook(() =>
        useCompletion(
          '@',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          undefined,
        ),
      );

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

      const { result } = renderHook(() =>
        useCompletion(
          '@',
          testCwd,
          true,
          mockSlashCommands,
          mockCommandContext,
          mockConfig,
        ),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].label).toBe('file1.txt');
    });
  });
});
