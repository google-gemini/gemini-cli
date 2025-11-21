/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { contextCommand } from './contextCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import * as contextInfoService from '../../services/contextInfoService.js';
import type { Config, GeminiClient } from '@google/gemini-cli-core';

// Mock the context info service
vi.mock('../../services/contextInfoService.js');

describe('contextCommand', () => {
  let mockContext: CommandContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockGetContextBreakdown: any;

  beforeEach(() => {
    mockContext = createMockCommandContext();
    mockGetContextBreakdown = vi
      .spyOn(contextInfoService, 'getContextBreakdown')
      .mockResolvedValue({
        model: 'gemini-2.5-pro',
        currentTokens: 5000,
        maxTokens: 1000000,
        systemPromptTokens: 500,
        toolsTokens: 2000,
        mcpToolsTokens: 1500,
        memoryTokens: 500,
        messagesTokens: 500,
        mcpTools: [
          { name: 'mcp__ide__getDiagnostics', server: 'ide', tokens: 750 },
          { name: 'mcp__ide__executeCode', server: 'ide', tokens: 750 },
        ],
        memoryFiles: [{ path: '/project/memory.md', tokens: 500 }],
        slashCommands: 0,
      });
  });

  it('should have correct command metadata', () => {
    expect(contextCommand.name).toBe('context');
    expect(contextCommand.altNames).toEqual(['tokens']);
    expect(contextCommand.description).toBe(
      'Display context window and token usage information',
    );
  });

  it('should call getContextBreakdown with config and geminiClient', async () => {
    const mockConfig = { getModel: () => 'gemini-2.5-pro' } as Config;
    const mockGeminiClient = {} as GeminiClient;

    mockContext.services.config = {
      ...mockConfig,
      getGeminiClient: () => mockGeminiClient,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    if (!contextCommand.action) throw new Error('Command has no action');

    await contextCommand.action(mockContext, '');

    expect(mockGetContextBreakdown).toHaveBeenCalledWith(
      mockContext.services.config,
      mockGeminiClient,
    );
  });

  it('should add context item with breakdown to UI', async () => {
    const mockConfig = { getModel: () => 'gemini-2.5-pro' } as Config;
    const mockGeminiClient = {} as GeminiClient;

    mockContext.services.config = {
      ...mockConfig,
      getGeminiClient: () => mockGeminiClient,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    if (!contextCommand.action) throw new Error('Command has no action');

    await contextCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: 'context',
        breakdown: expect.objectContaining({
          model: 'gemini-2.5-pro',
          currentTokens: 5000,
          maxTokens: 1000000,
          systemPromptTokens: 500,
          toolsTokens: 2000,
          mcpToolsTokens: 1500,
          memoryTokens: 500,
          messagesTokens: 500,
        }),
      },
      expect.any(Number),
    );
  });

  it('should handle null breakdown gracefully', async () => {
    mockGetContextBreakdown.mockResolvedValue(null);

    const mockConfig = { getModel: () => 'gemini-2.5-pro' } as Config;
    const mockGeminiClient = {} as GeminiClient;

    mockContext.services.config = {
      ...mockConfig,
      getGeminiClient: () => mockGeminiClient,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    if (!contextCommand.action) throw new Error('Command has no action');

    await contextCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: 'context',
        breakdown: null,
      },
      expect.any(Number),
    );
  });

  it('should work when config is null', async () => {
    mockContext.services.config = null;

    if (!contextCommand.action) throw new Error('Command has no action');

    await contextCommand.action(mockContext, '');

    expect(mockGetContextBreakdown).toHaveBeenCalledWith(null, undefined);
    expect(mockContext.ui.addItem).toHaveBeenCalled();
  });
});
