/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addMemory,
  listMemoryFiles,
  refreshMemory,
  showMemory,
} from '@google/gemini-cli-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AddMemoryCommand,
  ListMemoryCommand,
  MemoryCommand,
  RefreshMemoryCommand,
  ShowMemoryCommand,
} from './memory.js';
import type { CommandContext } from './types.js';
import type {
  AnyDeclarativeTool,
  Config,
  ToolRegistry,
} from '@google/gemini-cli-core';

// Mock the core functions
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    showMemory: vi.fn(),
    refreshMemory: vi.fn(),
    listMemoryFiles: vi.fn(),
    addMemory: vi.fn(),
  };
});

const mockShowMemory = vi.mocked(showMemory);
const mockRefreshMemory = vi.mocked(refreshMemory);
const mockListMemoryFiles = vi.mocked(listMemoryFiles);
const mockAddMemory = vi.mocked(addMemory);

describe('a2a-server memory commands', () => {
  let mockContext: CommandContext;
  let mockConfig: Config;
  let mockToolRegistry: ToolRegistry;
  let mockSaveMemoryTool: AnyDeclarativeTool;

  beforeEach(() => {
    mockSaveMemoryTool = {
      name: 'save_memory',
      description: 'Saves memory',
      buildAndExecute: vi.fn().mockResolvedValue(undefined),
    } as unknown as AnyDeclarativeTool;

    mockToolRegistry = {
      getTool: vi.fn(),
    } as unknown as ToolRegistry;

    mockConfig = {
      getToolRegistry: vi.fn().mockReturnValue(mockToolRegistry),
    } as unknown as Config;

    mockContext = {
      config: mockConfig,
    };

    vi.mocked(mockToolRegistry.getTool).mockReturnValue(mockSaveMemoryTool);
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

  describe('AddMemoryCommand', () => {
    it('returns message content if addMemory returns a message', async () => {
      const command = new AddMemoryCommand();
      mockAddMemory.mockReturnValue({
        type: 'message',
        messageType: 'error',
        content: 'error message',
      });

      const response = await command.execute(mockContext, []);

      expect(mockAddMemory).toHaveBeenCalledWith('');
      expect(response.name).toBe('memory add');
      expect(response.data).toBe('error message');
    });

    it('executes the save_memory tool if found', async () => {
      const command = new AddMemoryCommand();
      const fact = 'this is a new fact';
      mockAddMemory.mockReturnValue({
        type: 'tool',
        toolName: 'save_memory',
        toolArgs: { fact },
      });

      const response = await command.execute(mockContext, [
        'this',
        'is',
        'a',
        'new',
        'fact',
      ]);

      expect(mockAddMemory).toHaveBeenCalledWith(fact);
      expect(mockConfig.getToolRegistry).toHaveBeenCalled();
      expect(mockToolRegistry.getTool).toHaveBeenCalledWith('save_memory');
      expect(mockSaveMemoryTool.buildAndExecute).toHaveBeenCalledWith(
        { fact },
        expect.any(AbortSignal),
        undefined,
        {
          sanitizationConfig: {
            allowedEnvironmentVariables: [],
            blockedEnvironmentVariables: [],
            enableEnvironmentVariableRedaction: false,
          },
        },
      );
      expect(mockRefreshMemory).toHaveBeenCalledWith(mockContext.config);
      expect(response.name).toBe('memory add');
      expect(response.data).toBe(`Added memory: "${fact}"`);
    });

    it('returns an error if the tool is not found', async () => {
      const command = new AddMemoryCommand();
      const fact = 'another fact';
      mockAddMemory.mockReturnValue({
        type: 'tool',
        toolName: 'save_memory',
        toolArgs: { fact },
      });
      vi.mocked(mockToolRegistry.getTool).mockReturnValue(undefined);

      const response = await command.execute(mockContext, ['another', 'fact']);

      expect(response.name).toBe('memory add');
      expect(response.data).toBe('Error: Tool save_memory not found.');
    });
  });
});
