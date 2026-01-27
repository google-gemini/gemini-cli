/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runNonInteractive } from './nonInteractiveCli.js';
import {
  GeminiEventType,
  type Config,
  type Storage,
  type GeminiClient,
} from '@google/gemini-cli-core';
import type { LoadedSettings } from './config/settings.js';

import { handleAtCommand } from './ui/hooks/atCommandProcessor.js';

const mockRegisterActivityLogger = vi.fn();
vi.mock('./utils/activityLogger.js', () => ({
  registerActivityLogger: (config: Config) =>
    mockRegisterActivityLogger(config),
}));

// Mock atCommandProcessor
vi.mock('./ui/hooks/atCommandProcessor.js');

describe('runNonInteractive ActivityLogger', () => {
  let mockConfig: Config;
  let mockSettings: LoadedSettings;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(handleAtCommand).mockResolvedValue({
      processedQuery: [{ text: 'test' }],
    });

    mockConfig = {
      getContentGeneratorConfig: vi.fn().mockReturnValue({}),
      getDebugMode: vi.fn().mockReturnValue(true),
      storage: {
        getProjectTempLogsDir: vi.fn().mockReturnValue('/tmp/logs'),
      } as unknown as Storage,
      getGeminiClient: vi.fn().mockReturnValue({
        sendMessageStream: vi.fn().mockReturnValue(
          (async function* () {
            yield { type: GeminiEventType.Content, value: 'Response' };
            yield { type: GeminiEventType.Finished, value: {} };
          })(),
        ),
        getChat: vi.fn().mockReturnValue({
          recordCompletedToolCalls: vi.fn(),
        }),
      } as unknown as GeminiClient),
      getMessageBus: vi.fn().mockReturnValue({
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        publish: vi.fn(),
      }),
      getOutputFormat: vi.fn().mockReturnValue('text'),
      getRawOutput: vi.fn().mockReturnValue(false),
      getAcceptRawOutputRisk: vi.fn().mockReturnValue(false),
      getSessionId: vi.fn().mockReturnValue('session-id'),
      getModel: vi.fn().mockReturnValue('model'),
      getMaxSessionTurns: vi.fn().mockReturnValue(10),
      initialize: vi.fn(),
      isBrowserLaunchSuppressed: vi.fn().mockReturnValue(false),
      refreshAuth: vi.fn(),
    } as unknown as Config;

    mockSettings = {
      merged: {},
    } as unknown as LoadedSettings;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call registerActivityLogger when GEMINI_CLI_ENABLE_ACTIVITY_LOG is true', async () => {
    vi.stubEnv('GEMINI_CLI_ENABLE_ACTIVITY_LOG', 'true');

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'test input',
      prompt_id: 'test-prompt-id',
    });

    expect(mockRegisterActivityLogger).toHaveBeenCalledWith(mockConfig);
    vi.unstubAllEnvs();
  });

  it('should not call registerActivityLogger when GEMINI_CLI_ENABLE_ACTIVITY_LOG is not set', async () => {
    vi.stubEnv('GEMINI_CLI_ENABLE_ACTIVITY_LOG', '');

    await runNonInteractive({
      config: mockConfig,
      settings: mockSettings,
      input: 'test input',
      prompt_id: 'test-prompt-id',
    });

    expect(mockRegisterActivityLogger).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
