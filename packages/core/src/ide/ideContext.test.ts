/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IDE_MAX_OPEN_FILES,
  IDE_MAX_SELECTED_TEXT_LENGTH,
} from './constants.js';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IdeContextStore } from './ideContext.js';
import {
  type IdeContext,
  FileSchema,
  IdeContextSchema,
  type File,
} from './types.js';

describe('ideContext', () => {
  describe('createIdeContextStore', () => {
    let ideContextStore: IdeContextStore;

    beforeEach(() => {
      // Create a fresh, isolated instance for each test
      ideContextStore = new IdeContextStore();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return undefined initially for ide context', () => {
      expect(ideContextStore.get()).toBeUndefined();
    });

    it('should set and retrieve the ide context', () => {
      const testFile = {
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/test/file.ts',
              isActive: true,
              selectedText: '1234',
              timestamp: 0,
            },
          ],
        },
      };

      ideContextStore.set(testFile);

      const activeFile = ideContextStore.get();
      expect(activeFile).toEqual(testFile);
    });

    it('should update the ide context when called multiple times', () => {
      const firstFile = {
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/first.js',
              isActive: true,
              selectedText: '1234',
              timestamp: 0,
            },
          ],
        },
      };
      ideContextStore.set(firstFile);

      const secondFile = {
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/second.py',
              isActive: true,
              cursor: { line: 20, character: 30 },
              timestamp: 0,
            },
          ],
        },
      };
      ideContextStore.set(secondFile);

      const activeFile = ideContextStore.get();
      expect(activeFile).toEqual(secondFile);
    });

    it('should handle empty string for file path', () => {
      const testFile = {
        workspaceState: {
          openFiles: [
            {
              path: '',
              isActive: true,
              selectedText: '1234',
              timestamp: 0,
            },
          ],
        },
      };
      ideContextStore.set(testFile);
      expect(ideContextStore.get()).toEqual(testFile);
    });

    it('should notify subscribers when ide context changes', () => {
      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();

      ideContextStore.subscribe(subscriber1);
      ideContextStore.subscribe(subscriber2);

      const testFile = {
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/subscribed.ts',
              isActive: true,
              cursor: { line: 15, character: 25 },
              timestamp: 0,
            },
          ],
        },
      };
      ideContextStore.set(testFile);

      expect(subscriber1).toHaveBeenCalledTimes(1);
      expect(subscriber1).toHaveBeenCalledWith(testFile);
      expect(subscriber2).toHaveBeenCalledTimes(1);
      expect(subscriber2).toHaveBeenCalledWith(testFile);

      // Test with another update
      const newFile = {
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/new.js',
              isActive: true,
              selectedText: '1234',
              timestamp: 0,
            },
          ],
        },
      };
      ideContextStore.set(newFile);

      expect(subscriber1).toHaveBeenCalledTimes(2);
      expect(subscriber1).toHaveBeenCalledWith(newFile);
      expect(subscriber2).toHaveBeenCalledTimes(2);
      expect(subscriber2).toHaveBeenCalledWith(newFile);
    });

    it('should stop notifying a subscriber after unsubscribe', () => {
      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();

      const unsubscribe1 = ideContextStore.subscribe(subscriber1);
      ideContextStore.subscribe(subscriber2);

      ideContextStore.set({
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/file1.txt',
              isActive: true,
              selectedText: '1234',
              timestamp: 0,
            },
          ],
        },
      });
      expect(subscriber1).toHaveBeenCalledTimes(1);
      expect(subscriber2).toHaveBeenCalledTimes(1);

      unsubscribe1();

      ideContextStore.set({
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/file2.txt',
              isActive: true,
              selectedText: '1234',
              timestamp: 0,
            },
          ],
        },
      });
      expect(subscriber1).toHaveBeenCalledTimes(1); // Should not be called again
      expect(subscriber2).toHaveBeenCalledTimes(2);
    });

    it('should clear the ide context', () => {
      const testFile = {
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/test/file.ts',
              isActive: true,
              selectedText: '1234',
              timestamp: 0,
            },
          ],
        },
      };

      ideContextStore.set(testFile);

      expect(ideContextStore.get()).toEqual(testFile);

      ideContextStore.clear();

      expect(ideContextStore.get()).toBeUndefined();
    });

    it('should set the context and notify subscribers when no workspaceState is present', () => {
      const subscriber = vi.fn();
      ideContextStore.subscribe(subscriber);
      const context: IdeContext = {};
      ideContextStore.set(context);
      expect(ideContextStore.get()).toBe(context);
      expect(subscriber).toHaveBeenCalledWith(context);
    });

    it('should handle an empty openFiles array', () => {
      const context: IdeContext = {
        workspaceState: {
          openFiles: [],
        },
      };
      ideContextStore.set(context);
      expect(ideContextStore.get()?.workspaceState?.openFiles).toEqual([]);
    });

    it('should sort openFiles by timestamp in descending order', () => {
      const context: IdeContext = {
        workspaceState: {
          openFiles: [
            { path: 'file1.ts', timestamp: 100, isActive: false },
            { path: 'file2.ts', timestamp: 300, isActive: true },
            { path: 'file3.ts', timestamp: 200, isActive: false },
          ],
        },
      };
      ideContextStore.set(context);
      const openFiles = ideContextStore.get()?.workspaceState?.openFiles;
      expect(openFiles?.[0]?.path).toBe('file2.ts');
      expect(openFiles?.[1]?.path).toBe('file3.ts');
      expect(openFiles?.[2]?.path).toBe('file1.ts');
    });

    it('should mark only the most recent file as active and clear other active files', () => {
      const context: IdeContext = {
        workspaceState: {
          openFiles: [
            {
              path: 'file1.ts',
              timestamp: 100,
              isActive: true,
              selectedText: 'hello',
            },
            {
              path: 'file2.ts',
              timestamp: 300,
              isActive: true,
              cursor: { line: 1, character: 1 },
              selectedText: 'hello',
            },
            {
              path: 'file3.ts',
              timestamp: 200,
              isActive: false,
              selectedText: 'hello',
            },
          ],
        },
      };
      ideContextStore.set(context);
      const openFiles = ideContextStore.get()?.workspaceState?.openFiles;
      expect(openFiles?.[0]?.isActive).toBe(true);
      expect(openFiles?.[0]?.cursor).toBeDefined();
      expect(openFiles?.[0]?.selectedText).toBeDefined();

      expect(openFiles?.[1]?.isActive).toBe(false);
      expect(openFiles?.[1]?.cursor).toBeUndefined();
      expect(openFiles?.[1]?.selectedText).toBeUndefined();

      expect(openFiles?.[2]?.isActive).toBe(false);
      expect(openFiles?.[2]?.cursor).toBeUndefined();
      expect(openFiles?.[2]?.selectedText).toBeUndefined();
    });

    it('should truncate selectedText if it exceeds the max length', () => {
      const longText = 'a'.repeat(IDE_MAX_SELECTED_TEXT_LENGTH + 10);
      const context: IdeContext = {
        workspaceState: {
          openFiles: [
            {
              path: 'file1.ts',
              timestamp: 100,
              isActive: true,
              selectedText: longText,
            },
          ],
        },
      };
      ideContextStore.set(context);
      const selectedText =
        ideContextStore.get()?.workspaceState?.openFiles?.[0]?.selectedText;
      expect(selectedText).toHaveLength(
        IDE_MAX_SELECTED_TEXT_LENGTH + '... [TRUNCATED]'.length,
      );
      expect(selectedText?.endsWith('... [TRUNCATED]')).toBe(true);
    });

    it('should not truncate selectedText if it is within the max length', () => {
      const shortText = 'a'.repeat(IDE_MAX_SELECTED_TEXT_LENGTH);
      const context: IdeContext = {
        workspaceState: {
          openFiles: [
            {
              path: 'file1.ts',
              timestamp: 100,
              isActive: true,
              selectedText: shortText,
            },
          ],
        },
      };
      ideContextStore.set(context);
      const selectedText =
        ideContextStore.get()?.workspaceState?.openFiles?.[0]?.selectedText;
      expect(selectedText).toBe(shortText);
    });

    it('should truncate the openFiles list if it exceeds the max length', () => {
      const files: File[] = Array.from(
        { length: IDE_MAX_OPEN_FILES + 5 },
        (_, i) => ({
          path: `file${i}.ts`,
          timestamp: i,
          isActive: false,
        }),
      );
      const context: IdeContext = {
        workspaceState: {
          openFiles: files,
        },
      };
      ideContextStore.set(context);
      const openFiles = ideContextStore.get()?.workspaceState?.openFiles;
      expect(openFiles).toHaveLength(IDE_MAX_OPEN_FILES);
    });
  });

  describe('FileSchema', () => {
    it('should validate a file with only required fields', () => {
      const file = {
        path: '/path/to/file.ts',
        timestamp: 12345,
      };
      const result = FileSchema.safeParse(file);
      expect(result.success).toBe(true);
    });

    it('should validate a file with all fields', () => {
      const file = {
        path: '/path/to/file.ts',
        timestamp: 12345,
        isActive: true,
        selectedText: 'const x = 1;',
        cursor: {
          line: 10,
          character: 20,
        },
      };
      const result = FileSchema.safeParse(file);
      expect(result.success).toBe(true);
    });

    it('should fail validation if path is missing', () => {
      const file = {
        timestamp: 12345,
      };
      const result = FileSchema.safeParse(file);
      expect(result.success).toBe(false);
    });

    it('should fail validation if timestamp is missing', () => {
      const file = {
        path: '/path/to/file.ts',
      };
      const result = FileSchema.safeParse(file);
      expect(result.success).toBe(false);
    });
  });

  describe('IdeContextSchema', () => {
    it('should validate an empty context', () => {
      const context = {};
      const result = IdeContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });

    it('should validate a context with an empty workspaceState', () => {
      const context = {
        workspaceState: {},
      };
      const result = IdeContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });

    it('should validate a context with an empty openFiles array', () => {
      const context = {
        workspaceState: {
          openFiles: [],
        },
      };
      const result = IdeContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });

    it('should validate a context with a valid file', () => {
      const context = {
        workspaceState: {
          openFiles: [
            {
              path: '/path/to/file.ts',
              timestamp: 12345,
            },
          ],
        },
      };
      const result = IdeContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });

    it('should fail validation with an invalid file', () => {
      const context = {
        workspaceState: {
          openFiles: [
            {
              timestamp: 12345, // path is missing
            },
          ],
        },
      };
      const result = IdeContextSchema.safeParse(context);
      expect(result.success).toBe(false);
    });
  });
});
