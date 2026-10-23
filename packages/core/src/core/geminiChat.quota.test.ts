/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type GenerateContentResponse } from '@google/genai';
import { GeminiChat, type StreamEvent } from './geminiChat.js';
import type { Config } from '../config/config.js';
import { AuthType, type ContentGenerator } from './contentGenerator.js';
import { LlmRole } from '../telemetry/types.js';
import {
  RetryableQuotaError,
  TerminalQuotaError,
} from '../utils/googleQuotaErrors.js';
import { loadConversationRecord } from '../services/chatRecordingService.js';
import { createAvailabilityServiceMock } from '../availability/testUtils.js';
import { convertSessionToClientHistory } from '../utils/sessionUtils.js';
import { CoreToolCallStatus } from '../scheduler/types.js';

vi.mock('../utils/retry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/retry.js')>();
  return {
    ...actual,
    retryWithBackoff: vi.fn(async (apiCall: () => Promise<unknown>) =>
      apiCall(),
    ),
  };
});

vi.mock('../telemetry/loggers.js', () => ({
  logContentRetry: vi.fn(),
  logContentRetryFailure: vi.fn(),
  logNetworkRetryAttempt: vi.fn(),
}));

async function drain(stream: AsyncGenerator<StreamEvent>) {
  for await (const _ of stream) {
    // Consume responses so sendMessageStream runs its cleanup.
  }
}

describe('quota and cancellation session persistence', () => {
  let tempDir: string;
  let config: Config;
  let chat: GeminiChat;
  const generateContentStream =
    vi.fn<ContentGenerator['generateContentStream']>();

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'gemini-quota-history-'));
    generateContentStream.mockReset();
    config = {
      get config() {
        return this;
      },
      getSessionId: () => 'quota-history-session',
      promptId: 'quota-history-session',
      getProjectRoot: () => tempDir,
      storage: { getProjectTempDir: () => tempDir },
      toolRegistry: { getTool: vi.fn() },
      getModel: () => 'gemini-2.5-pro',
      getActiveModel: () => 'gemini-2.5-pro',
      getContentGeneratorConfig: () => ({
        authType: AuthType.LOGIN_WITH_GOOGLE,
      }),
      getContentGenerator: () => ({ generateContentStream }),
      isContextManagementEnabled: () => false,
      getDebugMode: () => false,
      getRetryFetchErrors: () => false,
      getMaxAttempts: () => 1,
      getRequestTimeoutMs: () => undefined,
      getHookSystem: () => undefined,
      modelConfigService: {
        getResolvedConfig: () => ({
          model: 'gemini-2.5-pro',
          generateContentConfig: {},
        }),
      },
      getModelAvailabilityService: () => createAvailabilityServiceMock(),
    } as unknown as Config;
    chat = new GeminiChat(config);
    await chat.initialize();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it.each([
    new TerminalQuotaError('Daily quota exhausted'),
    new RetryableQuotaError('Rate limit exhausted'),
  ])(
    'keeps the last prompt resumable after $name and shutdown cleanup',
    async (error) => {
      generateContentStream.mockRejectedValue(error);
      const stream = await chat.sendMessageStream(
        { model: 'gemini-2.5-pro' },
        'Please keep my last prompt',
        'quota-prompt',
        new AbortController().signal,
        LlmRole.MAIN,
      );
      await expect(drain(stream)).rejects.toThrow(error);

      // This is the normal quit cleanup, not the explicit /quit --delete action.
      const recorder = chat.getChatRecordingService();
      await recorder.deleteCurrentSessionIfNotResumableAsync();
      const saved = await loadConversationRecord(
        recorder.getConversationFilePath()!,
      );
      expect(saved?.messages).toEqual([
        expect.objectContaining({
          type: 'user',
          content: [{ text: 'Please keep my last prompt' }],
        }),
      ]);

      const resumed = new GeminiChat(config, '', [], [], {
        filePath: recorder.getConversationFilePath()!,
        conversation: saved!,
      });
      expect(resumed.getHistory()).toEqual(chat.getHistory());
      expect(resumed.getLastPromptTokenCount()).toBeGreaterThan(0);
    },
  );

  it('keeps completed tool rounds when quota cancellation is followed by signout and resume', async () => {
    generateContentStream.mockResolvedValueOnce(
      (async function* () {
        yield {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      id: 'read-1',
                      name: 'read_file',
                      args: { path: 'README.md' },
                    },
                    thoughtSignature: 'old-account-signature',
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        } as unknown as GenerateContentResponse;
      })(),
    );
    await drain(
      await chat.sendMessageStream(
        { model: 'gemini-2.5-pro' },
        'Inspect the README',
        'tool-prompt',
        new AbortController().signal,
        LlmRole.MAIN,
      ),
    );

    // The scheduler records completed tool metadata before sending its response.
    chat.getChatRecordingService().recordToolCalls('gemini-2.5-pro', [
      {
        id: 'read-1',
        name: 'read_file',
        args: { path: 'README.md' },
        result: [
          {
            functionResponse: {
              id: 'read-1',
              name: 'read_file',
              response: { text: 'README content' },
            },
          },
        ],
        status: CoreToolCallStatus.Success,
        timestamp: new Date().toISOString(),
      },
    ]);

    const controller = new AbortController();
    generateContentStream.mockImplementationOnce(async () => {
      controller.abort();
      throw Object.assign(new Error('Cancelled while waiting for quota'), {
        name: 'AbortError',
      });
    });
    await expect(
      drain(
        await chat.sendMessageStream(
          { model: 'gemini-2.5-pro' },
          [
            {
              functionResponse: {
                id: 'read-1',
                name: 'read_file',
                response: { text: 'README content' },
              },
            },
          ],
          'tool-prompt',
          controller.signal,
          LlmRole.MAIN,
        ),
      ),
    ).rejects.toThrow('Cancelled while waiting for quota');

    // /auth signout strips account-specific signatures without deleting turns.
    chat.stripThoughtsFromHistory();
    expect(chat.getHistory()).toHaveLength(3);
    expect(chat.getHistory()[1].parts?.[0]?.thoughtSignature).toBeUndefined();

    const recorder = chat.getChatRecordingService();
    await recorder.deleteCurrentSessionIfNotResumableAsync();
    const saved = await loadConversationRecord(
      recorder.getConversationFilePath()!,
    );
    expect(saved?.messages).toHaveLength(3);
    expect(saved?.messages[0].content).toEqual([
      { text: 'Inspect the README' },
    ]);
    expect(saved?.messages[1]).toEqual(
      expect.objectContaining({
        type: 'gemini',
        toolCalls: [
          expect.objectContaining({
            name: 'read_file',
            args: { path: 'README.md' },
            status: CoreToolCallStatus.Success,
          }),
        ],
      }),
    );
    expect(saved?.messages[2].content).toEqual([
      expect.objectContaining({
        functionResponse: expect.objectContaining({
          response: { text: 'README content' },
        }),
      }),
    ]);
    const resumed = new GeminiChat(
      config,
      '',
      [],
      convertSessionToClientHistory(saved!.messages),
      {
        filePath: recorder.getConversationFilePath()!,
        conversation: saved!,
      },
    );
    resumed.stripThoughtsFromHistory();
    expect(resumed.getHistory()).toEqual(chat.getHistory());
  });
});
