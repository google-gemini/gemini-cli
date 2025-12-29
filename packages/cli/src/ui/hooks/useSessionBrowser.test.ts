/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { act } from 'react';
import {
  useSessionBrowser,
  convertSessionToHistoryFormats,
} from './useSessionBrowser.js';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { getSessionFiles, type SessionInfo } from '../../utils/sessionUtils.js';
import type {
  Config,
  ConversationRecord,
  MessageRecord,
} from '@google/gemini-cli-core';
import { coreEvents } from '@google/gemini-cli-core';

// Mock modules
vi.mock('fs/promises');
vi.mock('path');
vi.mock('../../utils/sessionUtils.js');

const MOCKED_PROJECT_TEMP_DIR = '/test/project/temp';
const MOCKED_CHATS_DIR = '/test/project/temp/chats';
const MOCKED_SESSION_ID = 'test-session-123';
const MOCKED_CURRENT_SESSION_ID = 'current-session-id';

describe('useSessionBrowser', () => {
  const mockedFs = vi.mocked(fs);
  const mockedPath = vi.mocked(path);
  const mockedGetSessionFiles = vi.mocked(getSessionFiles);

  const mockConfig = {
    storage: {
      getProjectTempDir: vi.fn(),
    },
    setSessionId: vi.fn(),
    getSessionId: vi.fn(),
    getGeminiClient: vi.fn().mockReturnValue({
      getChatRecordingService: vi.fn().mockReturnValue({
        deleteSession: vi.fn(),
      }),
    }),
  } as unknown as Config;

  const mockOnLoadHistory = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(coreEvents, 'emitFeedback').mockImplementation(() => {});
    mockedPath.join.mockImplementation((...args) => args.join('/'));
    vi.mocked(mockConfig.storage.getProjectTempDir).mockReturnValue(
      MOCKED_PROJECT_TEMP_DIR,
    );
    vi.mocked(mockConfig.getSessionId).mockReturnValue(
      MOCKED_CURRENT_SESSION_ID,
    );
  });

  it('should successfully resume a session', async () => {
    const MOCKED_FILENAME = 'session-2025-01-01-test-session-123.json';
    const mockConversation: ConversationRecord = {
      sessionId: 'existing-session-456',
      messages: [{ type: 'user', content: 'Hello' } as MessageRecord],
    } as ConversationRecord;

    const mockSession = {
      id: MOCKED_SESSION_ID,
      fileName: MOCKED_FILENAME,
    } as SessionInfo;
    mockedGetSessionFiles.mockResolvedValue([mockSession]);
    mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConversation));

    const { result } = renderHook(() =>
      useSessionBrowser(mockConfig, mockOnLoadHistory),
    );

    await act(async () => {
      await result.current.handleResumeSession(mockSession);
    });
    expect(mockedFs.readFile).toHaveBeenCalledWith(
      `${MOCKED_CHATS_DIR}/${MOCKED_FILENAME}`,
      'utf8',
    );
    expect(mockConfig.setSessionId).toHaveBeenCalledWith(
      'existing-session-456',
    );
    expect(result.current.isSessionBrowserOpen).toBe(false);
    expect(mockOnLoadHistory).toHaveBeenCalled();
  });

  it('should handle file read error', async () => {
    const MOCKED_FILENAME = 'session-2025-01-01-test-session-123.json';
    const mockSession = {
      id: MOCKED_SESSION_ID,
      fileName: MOCKED_FILENAME,
    } as SessionInfo;
    mockedFs.readFile.mockRejectedValue(new Error('File not found'));

    const { result } = renderHook(() =>
      useSessionBrowser(mockConfig, mockOnLoadHistory),
    );

    await act(async () => {
      await result.current.handleResumeSession(mockSession);
    });

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'error',
      'Error resuming session:',
      expect.any(Error),
    );
    expect(result.current.isSessionBrowserOpen).toBe(false);
  });

  it('should handle JSON parse error', async () => {
    const MOCKED_FILENAME = 'invalid.json';
    const mockSession = {
      id: MOCKED_SESSION_ID,
      fileName: MOCKED_FILENAME,
    } as SessionInfo;
    mockedFs.readFile.mockResolvedValue('invalid json');

    const { result } = renderHook(() =>
      useSessionBrowser(mockConfig, mockOnLoadHistory),
    );

    await act(async () => {
      await result.current.handleResumeSession(mockSession);
    });

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'error',
      'Error resuming session:',
      expect.any(Error),
    );
    expect(result.current.isSessionBrowserOpen).toBe(false);
  });
});

// The convertSessionToHistoryFormats tests are self-contained and do not need changes.
describe('convertSessionToHistoryFormats', () => {
  it('should convert empty messages array', () => {
    const result = convertSessionToHistoryFormats([]);
    expect(result.uiHistory).toEqual([]);
    expect(result.clientHistory).toEqual([]);
  });

  it('should convert basic user and model messages', () => {
    const messages: MessageRecord[] = [
      { type: 'user', content: 'Hello' } as MessageRecord,
      { type: 'gemini', content: 'Hi there' } as MessageRecord,
    ];

    const result = convertSessionToHistoryFormats(messages);

    expect(result.uiHistory).toHaveLength(2);
    expect(result.uiHistory[0]).toMatchObject({ type: 'user', text: 'Hello' });
    expect(result.uiHistory[1]).toMatchObject({
      type: 'gemini',
      text: 'Hi there',
    });

    expect(result.clientHistory).toHaveLength(2);
    expect(result.clientHistory[0]).toEqual({
      role: 'user',
      parts: [{ text: 'Hello' }],
    });
    expect(result.clientHistory[1]).toEqual({
      role: 'model',
      parts: [{ text: 'Hi there' }],
    });
  });

  it('should filter out slash commands from client history but keep in UI', () => {
    const messages: MessageRecord[] = [
      { type: 'user', content: '/help' } as MessageRecord,
      { type: 'info', content: 'Help text' } as MessageRecord,
    ];

    const result = convertSessionToHistoryFormats(messages);

    expect(result.uiHistory).toHaveLength(2);
    expect(result.uiHistory[0]).toMatchObject({ type: 'user', text: '/help' });
    expect(result.uiHistory[1]).toMatchObject({
      type: 'info',
      text: 'Help text',
    });

    expect(result.clientHistory).toHaveLength(0);
  });

  it('should handle tool calls and responses', () => {
    const messages: MessageRecord[] = [
      { type: 'user', content: 'What time is it?' } as MessageRecord,
      {
        type: 'gemini',
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            name: 'get_time',
            args: {},
            status: 'success',
            result: '12:00',
          },
        ],
      } as unknown as MessageRecord,
    ];

    const result = convertSessionToHistoryFormats(messages);

    expect(result.uiHistory).toHaveLength(2);
    expect(result.uiHistory[0]).toMatchObject({
      type: 'user',
      text: 'What time is it?',
    });
    expect(result.uiHistory[1]).toMatchObject({
      type: 'tool_group',
      tools: [
        expect.objectContaining({
          callId: 'call_1',
          name: 'get_time',
          status: 'Success',
        }),
      ],
    });

    expect(result.clientHistory).toHaveLength(3); // User, Model (call), User (response)
    expect(result.clientHistory[0]).toEqual({
      role: 'user',
      parts: [{ text: 'What time is it?' }],
    });
    expect(result.clientHistory[1]).toEqual({
      role: 'model',
      parts: [
        {
          functionCall: {
            name: 'get_time',
            args: {},
            id: 'call_1',
          },
        },
      ],
    });
    expect(result.clientHistory[2]).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'call_1',
            name: 'get_time',
            response: { output: '12:00' },
          },
        },
      ],
    });
  });
});
