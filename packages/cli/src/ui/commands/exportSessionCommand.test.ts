/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportSessionCommand } from './exportSessionCommand.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SessionSelector } from '../../utils/sessionUtils.js';
import type { CommandContext } from './types.js';
import { Storage, type ConversationRecord } from '@google/gemini-cli-core';

vi.mock('node:fs/promises');
vi.mock('../../utils/sessionUtils.js');

describe('exportSessionCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Storage.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(Storage.prototype, 'getProjectTempDir').mockReturnValue(
      path.join(path.sep, 'tmp', 'mock-dir'),
    );
    mockContext = {
      services: {
        agentContext: {
          config: {
            sessionId: 'test-session-id',
            getSessionId: () => 'test-session-id',
            storage: new Storage(process.cwd()),
          },
        },
      },
      invocation: {
        args: '  export.json  ',
        name: 'export-session',
        raw: '/export-session export.json',
      },
      ui: {
        addItem: vi.fn(),
        setPendingItem: vi.fn(),
        pendingItem: null,
      },
    } as unknown as CommandContext;
  });

  it('should return error if no path is provided', async () => {
    mockContext.invocation!.args = '   ';
    const result = await exportSessionCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: expect.stringContaining('Please provide a file path'),
    });
  });

  it('should return error if sessionId is missing', async () => {
    mockContext.services.agentContext!.config.getSessionId = () =>
      undefined as unknown as string;
    const result = await exportSessionCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'No active session found to export.',
    });
  });

  it('should export the session successfully', async () => {
    const mockSessionData: ConversationRecord = {
      sessionId: 'test-session-id',
      messages: [],
      projectHash: 'hash',
      startTime: 'time',
      lastUpdated: 'time',
    };
    vi.mocked(SessionSelector.prototype.resolveSession).mockResolvedValue({
      sessionData: mockSessionData,
      sessionPath: path.join(
        path.sep,
        'tmp',
        'mock-dir',
        'chats',
        'session.jsonl',
      ),
      displayInfo: 'test',
    });

    vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

    const result = await exportSessionCommand.action!(mockContext, '');

    expect(result).toBeUndefined();
    expect(fs.writeFile).toHaveBeenCalledWith(
      path.resolve(process.cwd(), 'export.json'),
      JSON.stringify(mockSessionData, null, 2),
      'utf-8',
    );
    expect(mockContext.ui.setPendingItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'export_session',
        exportSession: { isPending: true },
      }),
    );
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'export_session',
        exportSession: {
          isPending: false,
          targetPath: expect.stringContaining('export.json'),
        },
      }),
      expect.any(Number),
    );
    expect(mockContext.ui.setPendingItem).toHaveBeenLastCalledWith(null);
  });

  it('should return error if resolveSession fails', async () => {
    vi.mocked(SessionSelector.prototype.resolveSession).mockRejectedValue(
      new Error('Session not found'),
    );

    const result = await exportSessionCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Failed to export session: Session not found',
    });
  });
});
