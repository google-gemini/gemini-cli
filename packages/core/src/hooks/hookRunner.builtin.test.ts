/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookRunner } from './hookRunner.js';
import {
  HookEventName,
  HookType,
  SessionEndReason,
  type BuiltinHookConfig,
  type SessionEndInput,
} from './types.js';
import type { Config } from '../config/config.js';

describe('HookRunner (Builtin Hooks)', () => {
  let hookRunner: HookRunner;
  let mockConfig: Config;

  beforeEach(() => {
    vi.resetAllMocks();

    mockConfig = {
      sanitizationConfig: {},
      isSessionLearningsEnabled: vi.fn().mockReturnValue(true),
      getGeminiClient: vi.fn().mockReturnValue({
        getChatRecordingService: vi.fn().mockReturnValue({
          getConversation: vi.fn().mockReturnValue({ messages: [] }),
          getConversationFilePath: vi
            .fn()
            .mockReturnValue('/tmp/transcript.json'),
        }),
      }),
      getContentGenerator: vi.fn(),
      getActiveModel: vi.fn().mockReturnValue('gemini-pro'),
      getWorkingDir: vi.fn().mockReturnValue('/work'),
    } as unknown as Config;

    hookRunner = new HookRunner(mockConfig);
  });

  it('should execute session-learnings builtin hook on SessionEnd', async () => {
    const hookConfig: BuiltinHookConfig = {
      type: HookType.Builtin,
      builtin_id: 'session-learnings',
      name: 'test-learnings',
    };

    const input: SessionEndInput = {
      session_id: 'test-session',
      transcript_path: '/tmp/transcript.json',
      cwd: '/work',
      hook_event_name: HookEventName.SessionEnd,
      timestamp: new Date().toISOString(),
      reason: SessionEndReason.Exit,
    };

    // Spy on the service
    const serviceSpy = vi
      .spyOn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (hookRunner as any).sessionLearningsService,
        'generateAndSaveLearnings',
      )
      .mockResolvedValue(undefined);

    const result = await hookRunner.executeHook(
      hookConfig,
      HookEventName.SessionEnd,
      input,
    );

    expect(result.success).toBe(true);
    expect(serviceSpy).toHaveBeenCalled();
  });

  it('should not execute session-learnings if reason is not exit/logout', async () => {
    const hookConfig: BuiltinHookConfig = {
      type: HookType.Builtin,
      builtin_id: 'session-learnings',
    };

    const input: SessionEndInput = {
      session_id: 'test-session',
      transcript_path: '/tmp/transcript.json',
      cwd: '/work',
      hook_event_name: HookEventName.SessionEnd,
      timestamp: new Date().toISOString(),
      reason: SessionEndReason.Clear,
    };

    const serviceSpy = vi.spyOn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (hookRunner as any).sessionLearningsService,
      'generateAndSaveLearnings',
    );

    const result = await hookRunner.executeHook(
      hookConfig,
      HookEventName.SessionEnd,
      input,
    );

    expect(result.success).toBe(true);
    expect(serviceSpy).not.toHaveBeenCalled();
  });
});
