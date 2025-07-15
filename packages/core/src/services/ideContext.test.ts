/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createIdeContextStore } from './ideContext.js';

describe('ideContext - Active File', () => {
  let ideContext: ReturnType<typeof createIdeContextStore>;

  beforeEach(() => {
    // Create a fresh, isolated instance for each test
    ideContext = createIdeContextStore();
  });

  it('should return undefined initially for active file context', () => {
    expect(ideContext.getActiveFileContext()).toBeUndefined();
  });

  it('should set and retrieve the active file context', () => {
    const testFile = {
      filePath: '/path/to/test/file.ts',
      cursor: { line: 5, character: 10 },
    };

    ideContext.setActiveFileContext(testFile);

    const activeFile = ideContext.getActiveFileContext();
    expect(activeFile).toEqual(testFile);
  });

  it('should update the active file context when called multiple times', () => {
    const firstFile = {
      filePath: '/path/to/first.js',
      cursor: { line: 1, character: 1 },
    };
    ideContext.setActiveFileContext(firstFile);

    const secondFile = {
      filePath: '/path/to/second.py',
      cursor: { line: 20, character: 30 },
    };
    ideContext.setActiveFileContext(secondFile);

    const activeFile = ideContext.getActiveFileContext();
    expect(activeFile).toEqual(secondFile);
  });

  it('should handle empty string for file path', () => {
    const testFile = {
      filePath: '',
      cursor: { line: 0, character: 0 },
    };
    ideContext.setActiveFileContext(testFile);
    expect(ideContext.getActiveFileContext()).toEqual(testFile);
  });

  it('should notify subscribers when active file context changes', () => {
    const subscriber1 = vi.fn();
    const subscriber2 = vi.fn();

    ideContext.subscribeToActiveFile(subscriber1);
    ideContext.subscribeToActiveFile(subscriber2);

    const testFile = {
      filePath: '/path/to/subscribed.ts',
      cursor: { line: 15, character: 25 },
    };
    ideContext.setActiveFileContext(testFile);

    expect(subscriber1).toHaveBeenCalledTimes(1);
    expect(subscriber1).toHaveBeenCalledWith(testFile);
    expect(subscriber2).toHaveBeenCalledTimes(1);
    expect(subscriber2).toHaveBeenCalledWith(testFile);

    // Test with another update
    const newFile = {
      filePath: '/path/to/new.js',
      cursor: { line: 1, character: 1 },
    };
    ideContext.setActiveFileContext(newFile);

    expect(subscriber1).toHaveBeenCalledTimes(2);
    expect(subscriber1).toHaveBeenCalledWith(newFile);
    expect(subscriber2).toHaveBeenCalledTimes(2);
    expect(subscriber2).toHaveBeenCalledWith(newFile);
  });

  it('should stop notifying a subscriber after unsubscribe', () => {
    const subscriber1 = vi.fn();
    const subscriber2 = vi.fn();

    const unsubscribe1 = ideContext.subscribeToActiveFile(subscriber1);
    ideContext.subscribeToActiveFile(subscriber2);

    ideContext.setActiveFileContext({
      filePath: '/path/to/file1.txt',
      cursor: { line: 1, character: 1 },
    });
    expect(subscriber1).toHaveBeenCalledTimes(1);
    expect(subscriber2).toHaveBeenCalledTimes(1);

    unsubscribe1();

    ideContext.setActiveFileContext({
      filePath: '/path/to/file2.txt',
      cursor: { line: 2, character: 2 },
    });
    expect(subscriber1).toHaveBeenCalledTimes(1); // Should not be called again
    expect(subscriber2).toHaveBeenCalledTimes(2);
  });

  it('should allow the cursor to be optional', () => {
    const testFile = {
      filePath: '/path/to/test/file.ts',
    };

    ideContext.setActiveFileContext(testFile);

    const activeFile = ideContext.getActiveFileContext();
    expect(activeFile).toEqual(testFile);
  });
});
