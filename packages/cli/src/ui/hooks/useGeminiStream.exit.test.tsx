/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useGeminiStream } from './useGeminiStream.js';
import { AuthType, ApprovalMode } from '@google/gemini-cli-core';
import type { Config , EditorType } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';

// Mocks
const mockHandleSlashCommand = vi.fn();

vi.mock('./useReactToolScheduler.js', () => ({
  useReactToolScheduler: vi.fn().mockReturnValue([
    [], // toolCalls
    vi.fn(), // scheduleToolCalls
    vi.fn(), // markToolsAsSubmitted
    vi.fn(), // setToolCallsForDisplay
    vi.fn(), // cancelAllToolCalls
    0, // lastToolOutputTime
  ]),
  mapToDisplay: vi.fn(),
}));

vi.mock('./useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('./shellCommandProcessor.js', () => ({
  useShellCommandProcessor: vi.fn().mockReturnValue({
    handleShellCommand: vi.fn(),
  }),
}));

vi.mock('./atCommandProcessor.js', () => ({
  handleAtCommand: vi.fn(),
}));

vi.mock('../utils/markdownUtilities.js', () => ({
  findLastSafeSplitPoint: vi.fn((s) => s.length),
}));

vi.mock('./useStateAndRef.js', () => ({
  useStateAndRef: vi.fn((initial) => {
    let val = initial;
    const ref = { current: val };
    const setVal = vi.fn((updater) => {
      val = typeof updater === 'function' ? updater(val) : updater;
      ref.current = val;
    });
    return [val, ref, setVal];
  }),
}));

vi.mock('./useLogger.js', () => ({
  useLogger: vi.fn().mockReturnValue({
    logMessage: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../contexts/SessionContext.js', () => ({
  useSessionStats: vi.fn(() => ({
    startNewPrompt: vi.fn(),
    addUsage: vi.fn(),
    getPromptCount: vi.fn(() => 0),
  })),
}));

vi.mock('./slashCommandProcessor.js', () => ({
  handleSlashCommand: vi.fn(),
}));

vi.mock('./useAlternateBuffer.js', () => ({
  useAlternateBuffer: vi.fn(() => false),
}));

describe('useGeminiStream - Exit/Quit Commands', () => {
  let mockConfig: Config;
  let mockLoadedSettings: LoadedSettings;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      getGeminiClient: vi.fn().mockReturnValue({
        getCurrentSequenceModel: vi.fn(),
        getChat: vi.fn().mockReturnValue({
          recordCompletedToolCalls: vi.fn(),
        }),
      }),
      storage: {},
      getProjectRoot: vi.fn(),
      getApprovalMode: () => ApprovalMode.DEFAULT,
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      getModel: vi.fn(() => 'gemini-pro'),
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: AuthType.USE_GEMINI,
      }),
      getCheckpointingEnabled: vi.fn(() => false),
      setQuotaErrorOccurred: vi.fn(),
      getMaxSessionTurns: vi.fn(() => 100),
      getSessionId: vi.fn(() => 'test-session-id'),
      isInteractive: vi.fn(() => true),
      getExperiments: vi.fn(() => ({ experimentIds: [] })),
    } as unknown as Config;

    mockLoadedSettings = {
      merged: { ui: { showCitations: true } },
    } as unknown as LoadedSettings;
  });

  it('should treat "exit" as a slash command', async () => {
    const { result } = renderHook(() =>
      useGeminiStream(
        mockConfig.getGeminiClient(),
        [],
        vi.fn(),
        mockConfig,
        mockLoadedSettings,
        vi.fn(),
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        vi.fn(),
        vi.fn(),
        false,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        80,
        24,
      ),
    );

    await result.current.submitQuery('exit');

    expect(mockHandleSlashCommand).toHaveBeenCalledWith('/exit');
  });

  it('should treat "quit" as a slash command', async () => {
    const { result } = renderHook(() =>
      useGeminiStream(
        mockConfig.getGeminiClient(),
        [],
        vi.fn(),
        mockConfig,
        mockLoadedSettings,
        vi.fn(),
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        vi.fn(),
        vi.fn(),
        false,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        80,
        24,
      ),
    );

    await result.current.submitQuery('quit');

    expect(mockHandleSlashCommand).toHaveBeenCalledWith('/exit');
  });

  it('should treat "EXIT" (case insensitive) as a slash command', async () => {
    const { result } = renderHook(() =>
      useGeminiStream(
        mockConfig.getGeminiClient(),
        [],
        vi.fn(),
        mockConfig,
        mockLoadedSettings,
        vi.fn(),
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        vi.fn(),
        vi.fn(),
        false,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        80,
        24,
      ),
    );

    await result.current.submitQuery('EXIT');

    expect(mockHandleSlashCommand).toHaveBeenCalledWith('/exit');
  });

  it('should NOT treat "exit now" as a slash command', async () => {
    const { result } = renderHook(() =>
      useGeminiStream(
        mockConfig.getGeminiClient(),
        [],
        vi.fn(),
        mockConfig,
        mockLoadedSettings,
        vi.fn(),
        mockHandleSlashCommand,
        false,
        () => 'vscode' as EditorType,
        vi.fn(),
        vi.fn(),
        false,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        80,
        24,
      ),
    );

    await result.current.submitQuery('exit now');

    expect(mockHandleSlashCommand).not.toHaveBeenCalledWith('/exit');
  });
});
