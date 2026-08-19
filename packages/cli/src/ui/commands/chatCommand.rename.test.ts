/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeminiClient } from '@google/gemini-cli-core';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { CommandContext, SlashCommand } from './types.js';
import { chatResumeSubCommands } from './chatCommand.js';

describe('chat rename command', () => {
  let context: CommandContext;
  let saveSummary: ReturnType<typeof vi.fn>;
  let getConversation: ReturnType<typeof vi.fn>;
  let renameCommand: SlashCommand;

  beforeEach(() => {
    saveSummary = vi.fn();
    getConversation = vi.fn().mockReturnValue({
      sessionId: 'session-1',
      messages: [],
    });

    const geminiClient = {
      getChatRecordingService: vi.fn().mockReturnValue({
        saveSummary,
        getConversation,
      }),
    } as unknown as GeminiClient;

    context = createMockCommandContext({
      services: {
        agentContext: {
          geminiClient,
        },
      },
    });

    const command = chatResumeSubCommands.find(
      (subCommand) => subCommand.name === 'rename',
    );
    if (!command?.action) {
      throw new Error('rename command must have an action');
    }
    renameCommand = command;
  });

  it('persists a trimmed title for the active session', async () => {
    const result = await renameCommand.action!(context, '  Release planning  ');

    expect(saveSummary).toHaveBeenCalledWith('Release planning');
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Conversation renamed to: Release planning.',
    });
  });

  it('requires a non-empty title', async () => {
    const result = await renameCommand.action!(context, '   ');

    expect(saveSummary).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Missing title. Usage: /chat rename <title>',
    });
  });

  it('reports when there is no active conversation', async () => {
    getConversation.mockReturnValue(null);

    const result = await renameCommand.action!(context, 'New title');

    expect(saveSummary).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'No active conversation found to rename.',
    });
  });

  it('reports when the chat client is unavailable', async () => {
    const noClientContext = createMockCommandContext({
      services: {
        agentContext: {
          geminiClient: undefined,
        },
      },
    });

    const result = await renameCommand.action!(noClientContext, 'New title');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'No chat client available to rename conversation.',
    });
  });
});
