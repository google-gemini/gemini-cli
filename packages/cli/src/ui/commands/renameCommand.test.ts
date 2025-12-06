/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renameCommand } from './renameCommand.js';
import type { ChatRecordingService } from '@google/gemini-cli-core';
import type { CommandContext } from './types.js';

describe('renameCommand', () => {
  let mockContext: CommandContext;
  let mockChatRecordingService: {
    setDisplayName: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockChatRecordingService = {
      setDisplayName: vi.fn(),
    };

    mockContext = {
      services: {
        chatRecordingService:
          mockChatRecordingService as unknown as ChatRecordingService,
      },
    } as unknown as CommandContext;
  });

  it('should require a name argument', async () => {
    const result = await renameCommand.action!(mockContext, '');
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Please provide a new name for the session.',
    });
  });

  it('should handle empty name string', async () => {
    const result = await renameCommand.action!(mockContext, '   ');
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Please provide a new name for the session.',
    });
  });

  it('should return error if chatRecordingService is not available', async () => {
    mockContext = {
      services: {
        chatRecordingService: undefined,
      },
    } as unknown as CommandContext;

    const result = await renameCommand.action!(mockContext, 'New Name');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Chat recording service is not available.',
    });
  });

  it('should rename the current session', async () => {
    const result = await renameCommand.action!(mockContext, 'New Name');

    expect(mockChatRecordingService.setDisplayName).toHaveBeenCalledWith(
      'New Name',
    );
    expect(result).toEqual({
      type: 'message',
      messageType: 'info',
      content: 'Session renamed to "New Name"',
    });
  });
});
