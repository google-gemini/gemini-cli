/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCompletion } from './useCompletion.js';
import {
  CommandContext,
  CommandKind,
  SlashCommand,
} from '../commands/types.js';
import {
  createTmpDir,
  cleanupTmpDir,
  FileSystemStructure,
} from '@google/gemini-cli-test-utils';
import { useTextBuffer } from '../components/shared/text-buffer.js';

const mockCommandContext = {} as CommandContext;

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

const fileSystemStructure: FileSystemStructure = {
  'README.md': '# Test Project',
  src: {
    'index.ts': 'console.log("hello");',
    'App.tsx': '<App />',
    components: {
      'Button.tsx': '<button />',
      'Input.tsx': '<input />',
    },
  },
  // To be ignored by .gitignore
  node_modules: { react: '...' },
  dist: { 'bundle.js': '...' },
  coverage: { 'lcov.info': '...' },
  data: {
    logs: {
      'test.log': 'log data',
    },
  },
  // To be ignored by .geminiignore
  secrets: { 'api.key': '...' },
  temp_data: { 'temp.txt': '...' },
  // The ignore files themselves
  '.gitignore': ['node_modules/', 'dist/', '/coverage', '*.log'].join('\n'),
  '.geminiignore': ['secrets/', 'temp_data/'].join('\n'),
};

describe('useCompletion integration with FileSearch', () => {
  let testCwd: string;

  // We are not testing slash commands here, so a minimal mock is fine.
  const mockSlashCommands: SlashCommand[] = [
    {
      name: 'help',
      description: 'Show help',
      kind: CommandKind.BUILT_IN,
      action: vi.fn(),
    },
  ];

  beforeAll(async () => {
    testCwd = await createTmpDir(fileSystemStructure);
  });

  afterAll(async () => {
    await cleanupTmpDir(testCwd);
  });

  it('should provide basic completion for a nested file', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        useTextBufferForTest('@src/App'),
        testCwd,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      const labels = result.current.suggestions.map((s) => s.label);
      expect(labels).toEqual(['src/App.tsx']);
    });
  });

  it('should respect .gitignore and not suggest ignored files', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        useTextBufferForTest('@data/logs/t'),
        testCwd,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(0);
    });
  });

  it('should respect .gitignore and not suggest ignored directories', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        useTextBufferForTest('@di'),
        testCwd,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(0);
    });
  });

  it('should respect .geminiignore and not suggest ignored directories', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        useTextBufferForTest('@sec'),
        testCwd,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(0);
    });
  });

  it('should provide suggestions for the whole file list', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        useTextBufferForTest('@'),
        testCwd,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.suggestions.length).toBeGreaterThan(0);
    });

    const labels = result.current.suggestions.map((s) => s.label);
    // Directories come first, then files, sorted alphabetically.
    expect(labels).toEqual([
      'data/',
      'data/logs/',
      'src/',
      'src/components/',
      '.geminiignore',
      '.gitignore',
      'README.md',
      'src/App.tsx',
      'src/components/Button.tsx',
      'src/components/Input.tsx',
      'src/index.ts',
    ]);
  });

  it('should show no suggestions for a nonexistent file', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        useTextBufferForTest('@nonexistent'),
        testCwd,
        mockSlashCommands,
        mockCommandContext,
      ),
    );

    await waitFor(() => {
      expect(result.current.isLoadingSuggestions).toBe(false);
    });

    expect(result.current.suggestions).toEqual([]);
  });

  it('should suggest gitignored files when respectGitIgnore is false', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        useTextBufferForTest('@dist/bundle'),
        testCwd,
        mockSlashCommands,
        mockCommandContext,
        {
          getFileFilteringOptions: () => ({
            respectGitIgnore: false,
            respectGeminiIgnore: true,
          }),
        },
      ),
    );

    await waitFor(() => {
      const labels = result.current.suggestions.map((s) => s.label);
      expect(labels).toEqual(['dist/bundle.js']);
    });
  });

  it('should suggest geminiignored files when respectGeminiIgnore is false', async () => {
    const { result } = renderHook(() =>
      useCompletion(
        useTextBufferForTest('@secrets/api'),
        testCwd,
        mockSlashCommands,
        mockCommandContext,
        {
          getFileFilteringOptions: () => ({
            respectGitIgnore: true,
            respectGeminiIgnore: false,
          }),
        },
      ),
    );

    await waitFor(() => {
      const labels = result.current.suggestions.map((s) => s.label);
      expect(labels).toEqual(['secrets/api.key']);
    });
  });
});
