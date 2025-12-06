/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renameCommand } from './renameCommand.js';
import { ChatRecordingService, type Config } from '@google/gemini-cli-core';
import { SessionSelector } from '../../utils/sessionUtils.js';
import type { CommandContext } from './types.js';
import path from 'node:path';

vi.mock('@google/gemini-cli-core');
vi.mock('../../utils/sessionUtils.js');

describe('renameCommand', () => {
  let mockConfig: Config;
  let mockContext: CommandContext;
  let mockChatRecordingService: {
    initialize: ReturnType<typeof vi.fn>;
    setDisplayName: ReturnType<typeof vi.fn>;
  };
  let mockSessionSelector: {
    listSessions: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockConfig = {
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/gemini'),
      },
    } as unknown as Config;

    mockContext = {
      services: {
        config: mockConfig,
      },
    } as unknown as CommandContext;

    mockChatRecordingService = {
      initialize: vi.fn(),
      setDisplayName: vi.fn(),
    };
    vi.mocked(ChatRecordingService).mockImplementation(
      () => mockChatRecordingService as unknown as ChatRecordingService,
    );

    mockSessionSelector = {
      listSessions: vi.fn(),
    };
    vi.mocked(SessionSelector).mockImplementation(
      () => mockSessionSelector as unknown as SessionSelector,
    );
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

  it('should silently ignore if no active session is found', async () => {
    mockSessionSelector.listSessions.mockResolvedValue([
      { id: 'other-session', isCurrentSession: false },
    ]);

    const result = await renameCommand.action!(mockContext, 'New Name');

    expect(result).toBeUndefined();
  });

  it('should rename the current session', async () => {
    const currentSession = {
      id: 'current-session-id',
      fileName: 'session-file.json',
      isCurrentSession: true,
    };
    mockSessionSelector.listSessions.mockResolvedValue([currentSession]);

    const result = await renameCommand.action!(mockContext, 'New Name');

    const expectedFilePath = path.join(
      '/tmp/gemini',
      'chats',
      'session-file.json',
    );

    expect(mockChatRecordingService.initialize).toHaveBeenCalledWith({
      sessionId: 'current-session-id',
      filePath: expectedFilePath,
    });
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
