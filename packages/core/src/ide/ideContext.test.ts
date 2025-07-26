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
    expect(ideContext.getOpenFilesContext()).toBeUndefined();
  });

  it('should set and retrieve the active file context', () => {
    const testFile = {
      activeFile: '/path/to/test/file.ts',
      selectedText: '1234',
    };

    ideContext.setOpenFilesContext(testFile);

    const activeFile = ideContext.getOpenFilesContext();
    expect(activeFile).toEqual(testFile);
  });

  it('should update the active file context when called multiple times', () => {
    const firstFile = {
      activeFile: '/path/to/first.js',
      selectedText: '1234',
    };
    ideContext.setOpenFilesContext(firstFile);

    const secondFile = {
      activeFile: '/path/to/second.py',
      cursor: { line: 20, character: 30 },
    };
    ideContext.setOpenFilesContext(secondFile);

    const activeFile = ideContext.getOpenFilesContext();
    expect(activeFile).toEqual(secondFile);
  });

  it('should handle empty string for file path', () => {
    const testFile = {
      activeFile: '',
      selectedText: '1234',
    };
    ideContext.setOpenFilesContext(testFile);
    expect(ideContext.getOpenFilesContext()).toEqual(testFile);
  });

  it('should notify subscribers when active file context changes', () => {
    const subscriber1 = vi.fn();
    const subscriber2 = vi.fn();

    ideContext.subscribeToOpenFiles(subscriber1);
    ideContext.subscribeToOpenFiles(subscriber2);

    const testFile = {
      activeFile: '/path/to/subscribed.ts',
      cursor: { line: 15, character: 25 },
    };
    ideContext.setOpenFilesContext(testFile);

    expect(subscriber1).toHaveBeenCalledTimes(1);
    expect(subscriber1).toHaveBeenCalledWith(testFile);
    expect(subscriber2).toHaveBeenCalledTimes(1);
    expect(subscriber2).toHaveBeenCalledWith(testFile);

    // Test with another update
    const newFile = {
      activeFile: '/path/to/new.js',
      selectedText: '1234',
    };
    ideContext.setOpenFilesContext(newFile);

    expect(subscriber1).toHaveBeenCalledTimes(2);
    expect(subscriber1).toHaveBeenCalledWith(newFile);
    expect(subscriber2).toHaveBeenCalledTimes(2);
    expect(subscriber2).toHaveBeenCalledWith(newFile);
  });

  it('should stop notifying a subscriber after unsubscribe', () => {
    const subscriber1 = vi.fn();
    const subscriber2 = vi.fn();

    const unsubscribe1 = ideContext.subscribeToOpenFiles(subscriber1);
    ideContext.subscribeToOpenFiles(subscriber2);

    ideContext.setOpenFilesContext({
      activeFile: '/path/to/file1.txt',
      selectedText: '1234',
    });
    expect(subscriber1).toHaveBeenCalledTimes(1);
    expect(subscriber2).toHaveBeenCalledTimes(1);

    unsubscribe1();

    ideContext.setOpenFilesContext({
      activeFile: '/path/to/file2.txt',
      selectedText: '1234',
    });
    expect(subscriber1).toHaveBeenCalledTimes(1); // Should not be called again
    expect(subscriber2).toHaveBeenCalledTimes(2);
  });

  it('should allow the cursor to be optional', () => {
    const testFile = {
      activeFile: '/path/to/test/file.ts',
    };

    ideContext.setOpenFilesContext(testFile);

    const activeFile = ideContext.getOpenFilesContext();
    expect(activeFile).toEqual(testFile);
  });

  it('should clear the active file context', () => {
    const testFile = {
      activeFile: '/path/to/test/file.ts',
      selectedText: '1234',
    };

    ideContext.setOpenFilesContext(testFile);

    expect(ideContext.getOpenFilesContext()).toEqual(testFile);

    ideContext.clearOpenFilesContext();

    expect(ideContext.getOpenFilesContext()).toBeUndefined();
  });
});
