/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  listMemoryFiles,
  refreshMemory,
  showMemory,
  type Config,
} from '@google/gemini-cli-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ListMemoryCommand,
  MemoryCommand,
  RefreshMemoryCommand,
  ShowMemoryCommand,
} from './memory.js';
import type { CommandContext } from './types.js';

// Mock the core functions
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    showMemory: vi.fn(),
    refreshMemory: vi.fn(),
    listMemoryFiles: vi.fn(),
  };
});

const mockShowMemory = vi.mocked(showMemory);
const mockRefreshMemory = vi.mocked(refreshMemory);
const mockListMemoryFiles = vi.mocked(listMemoryFiles);

describe('a2a-server memory commands', () => {
  let mockContext: CommandContext;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {} as unknown as Config;

    mockContext = {
      config: mockConfig,
    };
  });

  describe('MemoryCommand', () => {
    it('delegates to ShowMemoryCommand', async () => {
      const command = new MemoryCommand();
      mockShowMemory.mockReturnValue({
        type: 'message',
        messageType: 'info',
        content: 'showing memory',
      });
      const response = await command.execute(mockContext, []);
      expect(response.data).toBe('showing memory');
      expect(mockShowMemory).toHaveBeenCalledWith(mockContext.config);
    });
  });

  describe('ShowMemoryCommand', () => {
    it('executes showMemory and returns the content', async () => {
      const command = new ShowMemoryCommand();
      mockShowMemory.mockReturnValue({
        type: 'message',
        messageType: 'info',
        content: 'test memory content',
      });

      const response = await command.execute(mockContext, []);

      expect(mockShowMemory).toHaveBeenCalledWith(mockContext.config);
      expect(response.name).toBe('memory show');
      expect(response.data).toBe('test memory content');
    });
  });

  describe('RefreshMemoryCommand', () => {
    it('executes refreshMemory and returns the content', async () => {
      const command = new RefreshMemoryCommand();
      mockRefreshMemory.mockResolvedValue({
        type: 'message',
        messageType: 'info',
        content: 'memory refreshed',
      });

      const response = await command.execute(mockContext, []);

      expect(mockRefreshMemory).toHaveBeenCalledWith(mockContext.config);
      expect(response.name).toBe('memory refresh');
      expect(response.data).toBe('memory refreshed');
    });
  });

  describe('ListMemoryCommand', () => {
    it('executes listMemoryFiles and returns the content', async () => {
      const command = new ListMemoryCommand();
      mockListMemoryFiles.mockReturnValue({
        type: 'message',
        messageType: 'info',
        content: 'file1.md\nfile2.md',
      });

      const response = await command.execute(mockContext, []);

      expect(mockListMemoryFiles).toHaveBeenCalledWith(mockContext.config);
      expect(response.name).toBe('memory list');
      expect(response.data).toBe('file1.md\nfile2.md');
    });
  });
});
