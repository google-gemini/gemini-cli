/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { enhanceCommand } from './enhanceCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import { LlmRole } from '@google/gemini-cli-core';

describe('enhanceCommand', () => {
  let mockContext: CommandContext;
  let mockGenerateContent: Mock;

  beforeEach(() => {
    mockGenerateContent = vi.fn();
    mockContext = createMockCommandContext({
      services: {
        agentContext: {
          promptId: 'test-prompt-id',
          geminiClient: {
            getHistory: vi.fn().mockReturnValue([
              { role: 'user', parts: [{ text: 'previous user msg' }] },
              { role: 'model', parts: [{ text: 'previous model msg' }] },
            ]),
          },
          config: {
            getModel: vi.fn().mockReturnValue('test-model'),
            getContentGenerator: vi.fn().mockReturnValue({
              generateContent: mockGenerateContent,
            }),
            getGemini31LaunchedSync: vi.fn().mockReturnValue(true),
            getHasAccessToPreviewModel: vi.fn().mockReturnValue(true),
          },
        },
      },
      ui: {
        addItem: vi.fn(),
        setDebugMessage: vi.fn(),
      },
    } as unknown as CommandContext);
  });

  it('should have the correct name and description', () => {
    expect(enhanceCommand.name).toBe('enhance');
    expect(enhanceCommand.description).toBe(
      'Enhance a prompt with additional context and rephrasing',
    );
  });

  it('should show error if no prompt is provided', async () => {
    if (!enhanceCommand.action) throw new Error('Action must be defined');

    await enhanceCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: expect.stringContaining('Please provide a prompt'),
      }),
    );
  });

  it('should call generateContent with correct parameters and show enhanced prompt', async () => {
    if (!enhanceCommand.action) throw new Error('Action must be defined');

    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'Enhanced: do something' }],
          },
        },
      ],
    });

    await enhanceCommand.action(mockContext, 'do something');

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-model',
        contents: [
          { role: 'user', parts: [{ text: 'previous user msg' }] },
          { role: 'model', parts: [{ text: 'previous model msg' }] },
          { role: 'user', parts: [{ text: 'do something' }] },
        ],
        config: {
          systemInstruction: {
            role: 'system',
            parts: [
              {
                text: expect.stringContaining(
                  "Generate an enhanced version of the user's prompt",
                ),
              },
            ],
          },
        },
      }),
      'test-prompt-id',
      LlmRole.UTILITY_TOOL,
    );

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining(
          'Enhanced prompt:\n\nEnhanced: do something',
        ),
      }),
    );
    expect(mockContext.ui.setInput).toHaveBeenCalledWith(
      'Enhanced: do something',
    );
  });

  it('should clean the response from markdown and quotes', async () => {
    if (!enhanceCommand.action) throw new Error('Action must be defined');

    mockGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: '```markdown\n"Clean me"\n```' }],
          },
        },
      ],
    });

    await enhanceCommand.action(mockContext, 'dirty prompt');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('Enhanced prompt:\n\nClean me'),
      }),
    );
    expect(mockContext.ui.setInput).toHaveBeenCalledWith('Clean me');
  });

  it('should handle API errors gracefully', async () => {
    if (!enhanceCommand.action) throw new Error('Action must be defined');

    mockGenerateContent.mockRejectedValue(new Error('API Error'));

    await enhanceCommand.action(mockContext, 'test prompt');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: expect.stringContaining('Failed to enhance prompt: API Error'),
      }),
    );
  });

  it('should handle empty response from model', async () => {
    if (!enhanceCommand.action) throw new Error('Action must be defined');

    mockGenerateContent.mockResolvedValue({
      candidates: [],
    });

    await enhanceCommand.action(mockContext, 'test prompt');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ERROR,
        text: expect.stringContaining('Empty response from model'),
      }),
    );
  });
});
