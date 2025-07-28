/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createIdeContextStore,
  FileSchema,
  IdeContextSchema,
} from './ideContext.js';

describe('ideContext', () => {
  describe('createIdeContextStore', () => {
    let ideContext: ReturnType<typeof createIdeContextStore>;

    beforeEach(() => {
      // Create a fresh, isolated instance for each test
      ideContext = createIdeContextStore();
    });

    it('should return undefined initially for ide context', () => {
      expect(ideContext.getIdeContext()).toBeUndefined();
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

      ideContext.setIdeContext(testFile);

      const activeFile = ideContext.getIdeContext();
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
      ideContext.setIdeContext(firstFile);

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
      ideContext.setIdeContext(secondFile);

      const activeFile = ideContext.getIdeContext();
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
      ideContext.setIdeContext(testFile);
      expect(ideContext.getIdeContext()).toEqual(testFile);
    });

    it('should notify subscribers when ide context changes', () => {
      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();

      ideContext.subscribeToIdeContext(subscriber1);
      ideContext.subscribeToIdeContext(subscriber2);

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
      ideContext.setIdeContext(testFile);

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
      ideContext.setIdeContext(newFile);

      expect(subscriber1).toHaveBeenCalledTimes(2);
      expect(subscriber1).toHaveBeenCalledWith(newFile);
      expect(subscriber2).toHaveBeenCalledTimes(2);
      expect(subscriber2).toHaveBeenCalledWith(newFile);
    });

    it('should stop notifying a subscriber after unsubscribe', () => {
      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();

      const unsubscribe1 = ideContext.subscribeToIdeContext(subscriber1);
      ideContext.subscribeToIdeContext(subscriber2);

      ideContext.setIdeContext({
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

      ideContext.setIdeContext({
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

      ideContext.setIdeContext(testFile);

      expect(ideContext.getIdeContext()).toEqual(testFile);

      ideContext.clearIdeContext();

      expect(ideContext.getIdeContext()).toBeUndefined();
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
