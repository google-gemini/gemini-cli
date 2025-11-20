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

    mockedGetSessionFiles.mockResolvedValue([
      { id: MOCKED_SESSION_ID, fileName: MOCKED_FILENAME } as SessionInfo,
    ]);
    mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConversation));

    const { result } = renderHook(() =>
      useSessionBrowser(mockConfig, mockOnLoadHistory),
    );

    await act(async () => {
      await result.current.handleResumeSession(MOCKED_SESSION_ID);
    });

    expect(mockedGetSessionFiles).toHaveBeenCalledWith(
      MOCKED_CHATS_DIR,
      MOCKED_CURRENT_SESSION_ID,
    );
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

  it('should handle session not found error', async () => {
    mockedGetSessionFiles.mockResolvedValue([]);
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(() =>
      useSessionBrowser(mockConfig, mockOnLoadHistory),
    );

    await act(async () => {
      await result.current.handleResumeSession(MOCKED_SESSION_ID);
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error resuming session:',
      new Error(`Could not find session with ID: ${MOCKED_SESSION_ID}`),
    );
    expect(result.current.isSessionBrowserOpen).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it('should handle JSON parse error', async () => {
    const MOCKED_FILENAME = 'invalid.json';
    mockedGetSessionFiles.mockResolvedValue([
      { id: MOCKED_SESSION_ID, fileName: MOCKED_FILENAME } as SessionInfo,
    ]);
    mockedFs.readFile.mockResolvedValue('invalid json');
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(() =>
      useSessionBrowser(mockConfig, mockOnLoadHistory),
    );

    await act(async () => {
      await result.current.handleResumeSession(MOCKED_SESSION_ID);
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(result.current.isSessionBrowserOpen).toBe(false);
    consoleErrorSpy.mockRestore();
  });
});

// The convertSessionToHistoryFormats tests are self-contained and do not need changes.
// To keep the change minimal, I am only including the top-level describe block.
describe('convertSessionToHistoryFormats', () => {
  it('should convert empty messages array', () => {
    const result = convertSessionToHistoryFormats([]);
    expect(result.uiHistory).toEqual([]);
    expect(result.clientHistory).toEqual([]);
  });
});
