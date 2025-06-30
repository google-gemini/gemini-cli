/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { Text, Box } from 'ink';
import { act } from 'react-dom/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import { FileContextProvider, useFileContext } from './FileContextContext.js';
import { Config } from '@google/gemini-cli-core';
import * as fs from 'fs/promises';
import { Stats } from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs/promises');
vi.mock('path');

const mockFs = vi.mocked(fs);
const mockPath = vi.mocked(path);

// Mock Config
const mockConfig = {
  getTargetDir: () => '/test/project',
} as unknown as Config;

// Test component that uses the context and exposes actions
const TestComponent = forwardRef<{ actions: unknown; state: unknown }>(
  (props, ref) => {
    const { state, actions } = useFileContext();

    useImperativeHandle(ref, () => ({
      actions,
      state,
    }));

    return (
      <Box>
        <Text>Files: {state.totalFiles}</Text>
        <Text>Tokens: {state.totalTokens}</Text>
      </Box>
    );
  },
);
TestComponent.displayName = 'TestComponent';

describe('FileContextContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock path.resolve
    mockPath.resolve.mockReturnValue('/test/project/test.txt');

    // Mock fs.stat
    mockFs.stat.mockResolvedValue({
      isDirectory: () => false,
      size: 1024,
    } as unknown as Stats);
  });

  it('should provide initial state', () => {
    const { lastFrame } = render(
      <FileContextProvider config={mockConfig}>
        <TestComponent />
      </FileContextProvider>,
    );

    expect(lastFrame()).toContain('Files: 0');
    expect(lastFrame()).toContain('Tokens: 0');
  });

  it('should add files to context', async () => {
    const componentRef = {
      current: null as { actions: unknown; state: unknown } | null,
    };
    const { lastFrame } = render(
      <FileContextProvider config={mockConfig}>
        <TestComponent ref={componentRef} />
      </FileContextProvider>,
    );

    // Call action directly
    await act(async () => {
      if (componentRef.current) {
        await (
          componentRef.current.actions as unknown as {
            addFile: (file: string) => Promise<void>;
          }
        ).addFile('test.txt');
      }
    });

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(lastFrame()).toContain('Files: 1');
    expect(lastFrame()).toContain('Tokens: 256'); // 1024 / 4
  });

  it('should remove files from context', async () => {
    const componentRef = {
      current: null as { actions: unknown; state: unknown } | null,
    };
    const { lastFrame } = render(
      <FileContextProvider config={mockConfig}>
        <TestComponent ref={componentRef} />
      </FileContextProvider>,
    );

    // Add file first
    await act(async () => {
      if (componentRef.current) {
        await (
          componentRef.current.actions as unknown as {
            addFile: (file: string) => Promise<void>;
          }
        ).addFile('test.txt');
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Remove file
    await act(async () => {
      if (componentRef.current) {
        await (
          componentRef.current.actions as unknown as {
            removeFile: (file: string) => Promise<void>;
          }
        ).removeFile('test.txt');
      }
    });

    expect(lastFrame()).toContain('Files: 0');
    expect(lastFrame()).toContain('Tokens: 0');
  });

  it('should clear context', async () => {
    const componentRef = {
      current: null as { actions: unknown; state: unknown } | null,
    };
    const { lastFrame } = render(
      <FileContextProvider config={mockConfig}>
        <TestComponent ref={componentRef} />
      </FileContextProvider>,
    );

    // Add file first
    await act(async () => {
      if (componentRef.current) {
        await (
          componentRef.current.actions as unknown as {
            addFile: (file: string) => Promise<void>;
          }
        ).addFile('test.txt');
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Clear context
    await act(async () => {
      if (componentRef.current) {
        await (
          componentRef.current.actions as unknown as {
            clearContext: () => Promise<void>;
          }
        ).clearContext();
      }
    });

    expect(lastFrame()).toContain('Files: 0');
    expect(lastFrame()).toContain('Tokens: 0');
  });

  it('should prevent adding duplicate files', async () => {
    const componentRef = {
      current: null as { actions: unknown; state: unknown } | null,
    };
    const { lastFrame } = render(
      <FileContextProvider config={mockConfig}>
        <TestComponent ref={componentRef} />
      </FileContextProvider>,
    );

    // Add file twice
    await act(async () => {
      if (componentRef.current) {
        await (
          componentRef.current.actions as unknown as {
            addFile: (file: string) => Promise<void>;
          }
        ).addFile('test.txt');
        await (
          componentRef.current.actions as unknown as {
            addFile: (file: string) => Promise<void>;
          }
        ).addFile('test.txt'); // Should not add duplicate
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Should only have one file
    expect(lastFrame()).toContain('Files: 1');
  });

  it('should handle file not found errors', async () => {
    // Mock fs.stat to throw error
    mockFs.stat.mockRejectedValue(new Error('File not found'));

    const componentRef = {
      current: null as { actions: unknown; state: unknown } | null,
    };
    const { lastFrame } = render(
      <FileContextProvider config={mockConfig}>
        <TestComponent ref={componentRef} />
      </FileContextProvider>,
    );

    await act(async () => {
      if (componentRef.current) {
        await (
          componentRef.current.actions as unknown as {
            addFile: (file: string) => Promise<void>;
          }
        ).addFile('test.txt');
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Should not add file
    expect(lastFrame()).toContain('Files: 0');
  });

  it('should skip directories', async () => {
    // Mock fs.stat to return directory
    mockFs.stat.mockResolvedValue({
      isDirectory: () => true,
      size: 0,
    } as unknown as Stats);

    const componentRef = {
      current: null as { actions: unknown; state: unknown } | null,
    };
    const { lastFrame } = render(
      <FileContextProvider config={mockConfig}>
        <TestComponent ref={componentRef} />
      </FileContextProvider>,
    );

    await act(async () => {
      if (componentRef.current) {
        await (
          componentRef.current.actions as unknown as {
            addFile: (file: string) => Promise<void>;
          }
        ).addFile('test.txt');
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Should not add directory
    expect(lastFrame()).toContain('Files: 0');
  });
});
