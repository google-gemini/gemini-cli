/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Config } from '../config/config.js';
import {
  addMemory,
  listMemoryFiles,
  refreshMemory,
  showMemory,
} from './memory.js';
import * as memoryDiscovery from '../utils/memoryDiscovery.js';

vi.mock('../utils/memoryDiscovery.js', () => ({
  refreshServerHierarchicalMemory: vi.fn(),
}));

const mockRefresh = vi.mocked(memoryDiscovery.refreshServerHierarchicalMemory);

describe('memory commands', () => {
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getUserMemory: vi.fn(),
      getGeminiMdFileCount: vi.fn(),
      getGeminiMdFilePaths: vi.fn(),
      isJitContextEnabled: vi.fn(),
      updateSystemInstructionIfInitialized: vi
        .fn()
        .mockResolvedValue(undefined),
    } as unknown as Config;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('showMemory', () => {
    it('should show memory content if it exists', () => {
      vi.mocked(mockConfig.getUserMemory).mockReturnValue(
        'some memory content',
      );
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(1);

      const result = showMemory(mockConfig);

      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toContain(
          'Current memory content from 1 file(s)',
        );
        expect(result.content).toContain('some memory content');
      }
    });

    it('should show a message if memory is empty', () => {
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('');
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(0);

      const result = showMemory(mockConfig);

      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toBe('Memory is currently empty.');
      }
    });
  });

  describe('addMemory', () => {
    it('should return a tool action to save memory', () => {
      const result = addMemory('new memory');
      expect(result.type).toBe('tool');
      if (result.type === 'tool') {
        expect(result.toolName).toBe('save_memory');
        expect(result.toolArgs).toEqual({ fact: 'new memory' });
      }
    });

    it('should trim the arguments', () => {
      const result = addMemory('  new memory  ');
      expect(result.type).toBe('tool');
      if (result.type === 'tool') {
        expect(result.toolArgs).toEqual({ fact: 'new memory' });
      }
    });

    it('should return an error if args are empty', () => {
      const result = addMemory('');
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('error');
        expect(result.content).toBe('Usage: /memory add <text to remember>');
      }
    });

    it('should return an error if args are just whitespace', () => {
      const result = addMemory('   ');
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('error');
        expect(result.content).toBe('Usage: /memory add <text to remember>');
      }
    });

    it('should return an error if args are undefined', () => {
      const result = addMemory(undefined);
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('error');
        expect(result.content).toBe('Usage: /memory add <text to remember>');
      }
    });
  });

  describe('refreshMemory', () => {
    it('should refresh memory and show success message', async () => {
      mockRefresh.mockResolvedValue({
        memoryContent: 'refreshed content',
        fileCount: 2,
        filePaths: [],
      });

      const result = await refreshMemory(mockConfig);

      expect(mockRefresh).toHaveBeenCalledWith(mockConfig);
      expect(
        mockConfig.updateSystemInstructionIfInitialized,
      ).toHaveBeenCalled();
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toBe(
          'Memory refreshed successfully. Loaded 17 characters from 2 file(s).',
        );
      }
    });

    it('should show a message if no memory content is found after refresh', async () => {
      mockRefresh.mockResolvedValue({
        memoryContent: '',
        fileCount: 0,
        filePaths: [],
      });

      const result = await refreshMemory(mockConfig);
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toBe(
          'Memory refreshed successfully. No memory content found.',
        );
      }
    });
  });

  describe('listMemoryFiles', () => {
    it('should list the memory files in use', () => {
      const filePaths = ['/path/to/GEMINI.md', '/other/path/GEMINI.md'];
      vi.mocked(mockConfig.getGeminiMdFilePaths).mockReturnValue(filePaths);

      const result = listMemoryFiles(mockConfig);

      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toContain(
          'There are 2 GEMINI.md file(s) in use:',
        );
        expect(result.content).toContain(filePaths.join('\n'));
      }
    });

    it('should show a message if no memory files are in use', () => {
      vi.mocked(mockConfig.getGeminiMdFilePaths).mockReturnValue([]);

      const result = listMemoryFiles(mockConfig);

      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toBe('No GEMINI.md files in use.');
      }
    });

    it('should show a message if file paths are undefined', () => {
      vi.mocked(mockConfig.getGeminiMdFilePaths).mockReturnValue(
        undefined as unknown as string[],
      );

      const result = listMemoryFiles(mockConfig);

      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toBe('No GEMINI.md files in use.');
      }
    });
  });
});
