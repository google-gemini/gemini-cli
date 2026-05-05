/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportSessionCommand } from './exportSessionCommand.js';
import * as fs from 'node:fs/promises';
import { SessionSelector } from '../../utils/sessionUtils.js';
import type { CommandContext } from './types.js';
import { Storage } from '@google/gemini-cli-core';

vi.mock('node:fs/promises');
vi.mock('../../utils/sessionUtils.js');

describe('exportSessionCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Storage.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(Storage.prototype, 'getProjectTempDir').mockReturnValue('/tmp/mock-dir');
    mockContext = {
      services: {
        agentContext: {
          config: {
            sessionId: 'test-session-id',
          },
        },
      },
      invocation: {
        args: '  /path/to/export.json  ',
        name: 'export-session',
        raw: '/export-session /path/to/export.json',
      },
      ui: {
        addItem: vi.fn(),
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
    mockContext.services.agentContext!.config.sessionId = undefined as any;
    const result = await exportSessionCommand.action!(mockContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'No active session found to export.',
    });
  });

  it('should export the session successfully', async () => {
    const mockSessionData = { sessionId: 'test-session-id', messages: [] };
    vi.mocked(SessionSelector.prototype.resolveSession).mockResolvedValue({
      sessionData: mockSessionData,
      sessionPath: '/tmp/mock-dir/chats/session.jsonl',
      displayInfo: 'test',
    });

    vi.mocked(fs.access).mockRejectedValue(new Error('Not found'));

    const result = await exportSessionCommand.action!(mockContext, '');

    expect(result).toBeUndefined();
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('export.json'),
      JSON.stringify(mockSessionData, null, 2),
      'utf-8',
    );
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('Successfully exported session to'),
      }),
      expect.any(Number),
    );
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
