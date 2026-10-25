/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreToolCallStatus } from '@google/gemini-cli-core';
import { renderHook } from '../../test-utils/render.js';
import { StreamingState } from '../types.js';
import {
  resolveProgramStatusBlockedKind,
  useProgramStatus,
  type UseProgramStatusParams,
} from './useProgramStatus.js';
import { USER_CANCELLED_MESSAGE } from '../../utils/programStatus.js';
import * as confirmingTool from '../utils/confirmingTool.js';

const writeToStdout = vi.hoisted(() => vi.fn());
const registerSyncCleanup = vi.hoisted(() => vi.fn());
const removeSyncCleanup = vi.hoisted(() => vi.fn());

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    writeToStdout,
    debugLogger: { debug: vi.fn() },
  };
});

vi.mock('../../utils/cleanup.js', () => ({
  registerSyncCleanup,
  removeSyncCleanup,
}));

function baseParams(
  overrides: Partial<UseProgramStatusParams> = {},
): UseProgramStatusParams {
  return {
    enabled: true,
    isInteractive: true,
    stdoutIsTTY: true,
    outputFormat: 'text',
    acpMode: false,
    streamingState: StreamingState.Idle,
    initError: null,
    history: [],
    pendingHistoryItems: [],
    isAuthDialogOpen: false,
    isAuthenticating: false,
    isAwaitingApiKeyInput: false,
    isAwaitingLoginRestart: false,
    authConsentRequest: null,
    commandConfirmationRequest: null,
    permissionConfirmationRequest: null,
    hasConfirmUpdateExtensionRequests: false,
    hasLoopDetectionConfirmationRequest: false,
    isFolderTrustDialogOpen: false,
    ...overrides,
  };
}

describe('resolveProgramStatusBlockedKind', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns auth for auth dialogs', () => {
    expect(
      resolveProgramStatusBlockedKind(baseParams({ isAuthDialogOpen: true })),
    ).toBe('auth');
  });

  it('returns question for ask-user confirmations', () => {
    expect(
      resolveProgramStatusBlockedKind(
        baseParams({
          streamingState: StreamingState.WaitingForConfirmation,
          pendingHistoryItems: [
            {
              type: 'tool_group',
              tools: [
                {
                  callId: 'ask-user-1',
                  status: CoreToolCallStatus.AwaitingApproval,
                  name: 'ask_user',
                  description: 'Ask user',
                  resultDisplay: undefined,
                  confirmationDetails: {
                    type: 'ask_user',
                    questions: [
                      {
                        header: 'Need a choice',
                        question: 'Proceed?',
                        options: [],
                      },
                    ],
                  },
                },
              ],
            } as never,
          ],
        }),
      ),
    ).toBe('question');
  });

  it('returns permission for tool confirmations', () => {
    expect(
      resolveProgramStatusBlockedKind(
        baseParams({
          streamingState: StreamingState.WaitingForConfirmation,
          pendingHistoryItems: [
            {
              type: 'tool_group',
              tools: [
                {
                  callId: 'tool-1',
                  status: CoreToolCallStatus.AwaitingApproval,
                  name: 'run_shell_command',
                  description: 'Run command',
                  resultDisplay: undefined,
                  confirmationDetails: {
                    type: 'exec',
                    title: 'Run shell command',
                    command: 'ls',
                    rootCommand: 'ls',
                    rootCommands: ['ls'],
                  },
                },
              ],
            } as never,
          ],
        }),
      ),
    ).toBe('permission');
  });

  it('does not throw when the confirming tool is missing', () => {
    vi.spyOn(confirmingTool, 'getConfirmingToolState').mockReturnValue({
      tool: undefined as never,
      index: 1,
      total: 1,
    });

    expect(() =>
      resolveProgramStatusBlockedKind(
        baseParams({
          streamingState: StreamingState.WaitingForConfirmation,
        }),
      ),
    ).not.toThrow();
    expect(
      resolveProgramStatusBlockedKind(
        baseParams({
          streamingState: StreamingState.WaitingForConfirmation,
        }),
      ),
    ).toBe('permission');
  });
});

describe('useProgramStatus', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('emits idle on startup and does not repeat it', async () => {
    const { rerender, unmount } = await renderHook(
      (props: UseProgramStatusParams) => useProgramStatus(props),
      { initialProps: baseParams() },
    );

    expect(writeToStdout.mock.calls.map((call) => String(call[0]))).toEqual([
      '\x1b]7501;state=idle:app=gemini\x1b\\',
    ]);

    rerender(baseParams());
    expect(writeToStdout).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('emits working then done after a finished turn', async () => {
    const { rerender, unmount } = await renderHook(
      (props: UseProgramStatusParams) => useProgramStatus(props),
      { initialProps: baseParams() },
    );

    rerender(baseParams({ streamingState: StreamingState.Responding }));
    rerender(
      baseParams({
        streamingState: StreamingState.Idle,
        history: [
          { id: 1, type: 'user', text: 'hello' },
          { id: 2, type: 'gemini', text: 'hi' },
        ],
      }),
    );

    const emitted = writeToStdout.mock.calls.map((call) => String(call[0]));
    expect(emitted[1]).toContain('state=working');
    expect(emitted[2]).toContain('state=done');
    unmount();
  });

  it('emits idle after a cancelled turn instead of done', async () => {
    const { rerender, unmount } = await renderHook(
      (props: UseProgramStatusParams) => useProgramStatus(props),
      {
        initialProps: baseParams({
          streamingState: StreamingState.Responding,
        }),
      },
    );

    rerender(
      baseParams({
        streamingState: StreamingState.Idle,
        history: [
          { id: 1, type: 'user', text: 'hello' },
          { id: 2, type: 'info', text: USER_CANCELLED_MESSAGE },
        ],
      }),
    );

    const emitted = writeToStdout.mock.calls.map((call) => String(call[0]));
    expect(emitted.at(-1)).toContain('state=idle');
    expect(emitted.join('\n')).not.toContain('state=done');
    unmount();
  });

  it('does not write when the setting is off', async () => {
    const { unmount } = await renderHook(() =>
      useProgramStatus(baseParams({ enabled: false })),
    );

    expect(writeToStdout).not.toHaveBeenCalled();
    unmount();
  });

  it('does not write for JSON, ACP, or non-interactive sessions', async () => {
    const { unmount: unmountJson } = await renderHook(() =>
      useProgramStatus(baseParams({ outputFormat: 'json' })),
    );
    const { unmount: unmountAcp } = await renderHook(() =>
      useProgramStatus(baseParams({ acpMode: true })),
    );
    const { unmount: unmountNonInteractive } = await renderHook(() =>
      useProgramStatus(baseParams({ isInteractive: false })),
    );

    expect(writeToStdout).not.toHaveBeenCalled();
    unmountJson();
    unmountAcp();
    unmountNonInteractive();
  });

  it('emits idle and clear on unmount', async () => {
    const { unmount } = await renderHook(() =>
      useProgramStatus(
        baseParams({ streamingState: StreamingState.Responding }),
      ),
    );

    writeToStdout.mockClear();
    unmount();

    expect(writeToStdout.mock.calls.map((call) => String(call[0]))).toEqual([
      '\x1b]7501;state=idle:app=gemini\x1b\\',
      '\x1b]7501;state=clear\x1b\\',
    ]);
  });

  it('registers sync cleanup once even when active toggles', async () => {
    const { rerender, unmount } = await renderHook(
      (props: UseProgramStatusParams) => useProgramStatus(props),
      { initialProps: baseParams({ enabled: false }) },
    );

    expect(registerSyncCleanup).toHaveBeenCalledTimes(1);
    expect(writeToStdout).not.toHaveBeenCalled();

    rerender(baseParams({ enabled: true }));
    rerender(baseParams({ enabled: false }));
    rerender(baseParams({ enabled: true }));
    rerender(baseParams({ enabled: false }));

    expect(registerSyncCleanup).toHaveBeenCalledTimes(1);
    expect(removeSyncCleanup).not.toHaveBeenCalled();

    const registered = registerSyncCleanup.mock.calls[0]?.[0] as () => void;
    unmount();
    expect(removeSyncCleanup).toHaveBeenCalledTimes(1);
    expect(removeSyncCleanup).toHaveBeenCalledWith(registered);
  });
});
