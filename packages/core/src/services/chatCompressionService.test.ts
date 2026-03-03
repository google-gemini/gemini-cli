/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ChatCompressionService,
  findCompressSplitPoint,
  modelStringToModelConfigAlias,
} from './chatCompressionService.js';
import type { Content, GenerateContentResponse } from '@google/genai';
import { CompressionStatus } from '../core/turn.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type { GeminiChat } from '../core/geminiChat.js';
import type { Config } from '../config/config.js';
import * as fileUtils from '../utils/fileUtils.js';
import { TOOL_OUTPUTS_DIR } from '../utils/fileUtils.js';
import { getInitialChatHistory } from '../utils/environmentContext.js';
import * as tokenCalculation from '../utils/tokenCalculation.js';
import { tokenLimit } from '../core/tokenLimits.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

vi.mock('../telemetry/loggers.js');
vi.mock('../utils/environmentContext.js');
vi.mock('../core/tokenLimits.js');

describe('findCompressSplitPoint', () => {
  it('should throw an error for non-positive numbers', () => {
    expect(() => findCompressSplitPoint([], 0)).toThrow(
      'Fraction must be between 0 and 1',
    );
  });

  it('should throw an error for a fraction greater than or equal to 1', () => {
    expect(() => findCompressSplitPoint([], 1)).toThrow(
      'Fraction must be between 0 and 1',
    );
  });

  it('should handle an empty history', () => {
    expect(findCompressSplitPoint([], 0.5)).toBe(0);
  });

  it('should handle a fraction in the middle', () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'This is the first message.' }] }, // JSON length: 66 (19%)
      { role: 'model', parts: [{ text: 'This is the second message.' }] }, // JSON length: 68 (40%)
      { role: 'user', parts: [{ text: 'This is the third message.' }] }, // JSON length: 66 (60%)
      { role: 'model', parts: [{ text: 'This is the fourth message.' }] }, // JSON length: 68 (80%)
      { role: 'user', parts: [{ text: 'This is the fifth message.' }] }, // JSON length: 65 (100%)
    ];
    expect(findCompressSplitPoint(history, 0.5)).toBe(4);
  });

  it('should handle a fraction of last index', () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'This is the first message.' }] }, // JSON length: 66 (19%)
      { role: 'model', parts: [{ text: 'This is the second message.' }] }, // JSON length: 68 (40%)
      { role: 'user', parts: [{ text: 'This is the third message.' }] }, // JSON length: 66 (60%)
      { role: 'model', parts: [{ text: 'This is the fourth message.' }] }, // JSON length: 68 (80%)
      { role: 'user', parts: [{ text: 'This is the fifth message.' }] }, // JSON length: 65 (100%)
    ];
    expect(findCompressSplitPoint(history, 0.9)).toBe(4);
  });

  it('should handle a fraction of after last index', () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'This is the first message.' }] }, // JSON length: 66 (24%)
      { role: 'model', parts: [{ text: 'This is the second message.' }] }, // JSON length: 68 (50%)
      { role: 'user', parts: [{ text: 'This is the third message.' }] }, // JSON length: 66 (74%)
      { role: 'model', parts: [{ text: 'This is the fourth message.' }] }, // JSON length: 68 (100%)
    ];
    expect(findCompressSplitPoint(history, 0.8)).toBe(4);
  });

  it('should return earlier splitpoint if no valid ones are after threshold', () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'This is the first message.' }] },
      { role: 'model', parts: [{ text: 'This is the second message.' }] },
      { role: 'user', parts: [{ text: 'This is the third message.' }] },
      { role: 'model', parts: [{ functionCall: { name: 'foo', args: {} } }] },
    ];
    // Can't return 4 because the previous item has a function call.
    expect(findCompressSplitPoint(history, 0.99)).toBe(2);
  });

  it('should handle a history with only one item', () => {
    const historyWithEmptyParts: Content[] = [
      { role: 'user', parts: [{ text: 'Message 1' }] },
    ];
    expect(findCompressSplitPoint(historyWithEmptyParts, 0.5)).toBe(0);
  });

  it('should handle history with weird parts', () => {
    const historyWithEmptyParts: Content[] = [
      { role: 'user', parts: [{ text: 'Message 1' }] },
      {
        role: 'model',
        parts: [{ fileData: { fileUri: 'derp', mimeType: 'text/plain' } }],
      },
      { role: 'user', parts: [{ text: 'Message 2' }] },
    ];
    expect(findCompressSplitPoint(historyWithEmptyParts, 0.5)).toBe(2);
  });
});

describe('modelStringToModelConfigAlias', () => {
  it('should return the default model for unexpected aliases', () => {
    expect(modelStringToModelConfigAlias('gemini-flash-flash')).toBe(
      'chat-compression-default',
    );
  });

  it('should handle valid names', () => {
    expect(modelStringToModelConfigAlias('gemini-3-pro-preview')).toBe(
      'chat-compression-3-pro',
    );
    expect(modelStringToModelConfigAlias('gemini-2.5-pro')).toBe(
      'chat-compression-2.5-pro',
    );
    expect(modelStringToModelConfigAlias('gemini-2.5-flash')).toBe(
      'chat-compression-2.5-flash',
    );
    expect(modelStringToModelConfigAlias('gemini-2.5-flash-lite')).toBe(
      'chat-compression-2.5-flash-lite',
    );
  });
});

describe('ChatCompressionService', () => {
  let service: ChatCompressionService;
  let mockChat: GeminiChat;
  let mockConfig: Config;
  let testTempDir: string;
  const mockModel = 'gemini-2.5-pro';
  const mockPromptId = 'test-prompt-id';

  beforeEach(() => {
    testTempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'chat-compression-test-'),
    );
    service = new ChatCompressionService();
    mockChat = {
      getHistory: vi.fn(),
      getLastPromptTokenCount: vi.fn().mockReturnValue(500),
    } as unknown as GeminiChat;

    const mockGenerateContent = vi
      .fn()
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ text: 'Initial Summary' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse)
      .mockResolvedValueOnce({
        candidates: [
          {
            content: {
              parts: [{ text: 'Verified Summary' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse);

    mockConfig = {
      getCompressionThreshold: vi.fn(),
      getBaseLlmClient: vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
      isInteractive: vi.fn().mockReturnValue(false),
      getActiveModel: vi.fn().mockReturnValue(mockModel),
      getContentGenerator: vi.fn().mockReturnValue({
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 100 }),
      }),
      getEnableHooks: vi.fn().mockReturnValue(false),
      getMessageBus: vi.fn().mockReturnValue(undefined),
      getHookSystem: () => undefined,
      getNextCompressionTruncationId: vi.fn().mockReturnValue(1),
      getTruncateToolOutputThreshold: vi.fn().mockReturnValue(40000),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue(testTempDir),
      },
    } as unknown as Config;

    vi.mocked(getInitialChatHistory).mockImplementation(
      async (_config, extraHistory) => extraHistory || [],
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
  });

  it('should return NOOP if history is empty', async () => {
    vi.mocked(mockChat.getHistory).mockReturnValue([]);
    const result = await service.compress(
      mockChat,
      mockPromptId,
      false,
      mockModel,
      mockConfig,
      false,
    );
    expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
    expect(result.newHistory).toBeNull();
  });

  it('should return NOOP if previously failed and not forced', async () => {
    vi.mocked(mockChat.getHistory).mockReturnValue([
      { role: 'user', parts: [{ text: 'hi' }] },
    ]);
    const result = await service.compress(
      mockChat,
      mockPromptId,
      false,
      mockModel,
      mockConfig,
      false,
    );
    // It should now attempt compression even if previously failed (logic removed)
    // But since history is small, it will be NOOP due to threshold
    expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
    expect(result.newHistory).toBeNull();
  });

  it('should return NOOP if under token threshold and not forced', async () => {
    vi.mocked(mockChat.getHistory).mockReturnValue([
      { role: 'user', parts: [{ text: 'hi' }] },
    ]);
    vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(600);
    vi.mocked(tokenLimit).mockReturnValue(1000);
    // Threshold is 0.5 * 1000 = 500. 600 > 500, so it SHOULD compress.
    // Wait, the default threshold is 0.5.
    // Let's set it explicitly.
    vi.mocked(mockConfig.getCompressionThreshold).mockResolvedValue(0.7);
    // 600 < 700, so NOOP.

    const result = await service.compress(
      mockChat,
      mockPromptId,
      false,
      mockModel,
      mockConfig,
      false,
    );
    expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
    expect(result.newHistory).toBeNull();
  });

  it('should compress if over token threshold with verification turn', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'msg1' }] },
      { role: 'model', parts: [{ text: 'msg2' }] },
      { role: 'user', parts: [{ text: 'msg3' }] },
      { role: 'model', parts: [{ text: 'msg4' }] },
    ];
    vi.mocked(mockChat.getHistory).mockReturnValue(history);
    vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(600000);
    // 600k > 500k (0.5 * 1M), so should compress.

    const result = await service.compress(
      mockChat,
      mockPromptId,
      false,
      mockModel,
      mockConfig,
      false,
    );

    expect(result.info.compressionStatus).toBe(CompressionStatus.COMPRESSED);
    expect(result.newHistory).not.toBeNull();
    // It should contain the final verified summary
    expect(result.newHistory![0].parts![0].text).toBe('Verified Summary');
    expect(mockConfig.getBaseLlmClient().generateContent).toHaveBeenCalledTimes(
      2,
    );
  });

  it('should fall back to initial summary if verification response is empty', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'msg1' }] },
      { role: 'model', parts: [{ text: 'msg2' }] },
    ];
    vi.mocked(mockChat.getHistory).mockReturnValue(history);
    vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(600000);

    // Completely override the LLM client for this test to avoid conflicting with beforeEach mocks
    const mockLlmClient = {
      generateContent: vi
        .fn()
        .mockResolvedValueOnce({
          candidates: [{ content: { parts: [{ text: 'Initial Summary' }] } }],
        } as unknown as GenerateContentResponse)
        .mockResolvedValueOnce({
          candidates: [{ content: { parts: [{ text: '   ' }] } }],
        } as unknown as GenerateContentResponse),
    };
    vi.mocked(mockConfig.getBaseLlmClient).mockReturnValue(
      mockLlmClient as unknown as BaseLlmClient,
    );

    const result = await service.compress(
      mockChat,
      mockPromptId,
      false,
      mockModel,
      mockConfig,
      false,
    );

    expect(result.info.compressionStatus).toBe(CompressionStatus.COMPRESSED);
    expect(result.newHistory![0].parts![0].text).toBe('Initial Summary');
  });

  it('should use anchored instruction when a previous snapshot is present', async () => {
    const history: Content[] = [
      {
        role: 'user',
        parts: [{ text: '<state_snapshot>old</state_snapshot>' }],
      },
      { role: 'model', parts: [{ text: 'msg2' }] },
      { role: 'user', parts: [{ text: 'msg3' }] },
      { role: 'model', parts: [{ text: 'msg4' }] },
    ];
    vi.mocked(mockChat.getHistory).mockReturnValue(history);
    vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(800);
    vi.mocked(tokenLimit).mockReturnValue(1000);

    await service.compress(
      mockChat,
      mockPromptId,
      false,
      mockModel,
      mockConfig,
      false,
    );

    const firstCall = vi.mocked(mockConfig.getBaseLlmClient().generateContent)
      .mock.calls[0][0];
    const lastContent = firstCall.contents?.[firstCall.contents.length - 1];
    expect(lastContent?.parts?.[0].text).toContain(
      'A previous <state_snapshot> exists',
    );
  });

  it('should force compress even if under threshold', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'msg1' }] },
      { role: 'model', parts: [{ text: 'msg2' }] },
      { role: 'user', parts: [{ text: 'msg3' }] },
      { role: 'model', parts: [{ text: 'msg4' }] },
    ];
    vi.mocked(mockChat.getHistory).mockReturnValue(history);
    vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(100);

    const result = await service.compress(
      mockChat,
      mockPromptId,
      true, // forced
      mockModel,
      mockConfig,
      false,
    );

    expect(result.info.compressionStatus).toBe(CompressionStatus.COMPRESSED);
    expect(result.newHistory).not.toBeNull();
  });

  it('should return FAILED if new token count is inflated', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'msg1' }] },
      { role: 'model', parts: [{ text: 'msg2' }] },
    ];
    vi.mocked(mockChat.getHistory).mockReturnValue(history);
    vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(100);

    const longSummary = 'a'.repeat(1000); // Long summary to inflate token count
    vi.mocked(mockConfig.getBaseLlmClient().generateContent).mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: longSummary }],
          },
        },
      ],
    } as unknown as GenerateContentResponse);

    // Inflate the token count by spying on calculateRequestTokenCount
    vi.spyOn(tokenCalculation, 'calculateRequestTokenCount').mockResolvedValue(
      10000,
    );

    const result = await service.compress(
      mockChat,
      mockPromptId,
      true,
      mockModel,
      mockConfig,
      false,
    );

    expect(result.info.compressionStatus).toBe(
      CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
    );
    expect(result.newHistory).toBeNull();
  });

  it('should return COMPRESSION_FAILED_EMPTY_SUMMARY if summary is empty', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'msg1' }] },
      { role: 'model', parts: [{ text: 'msg2' }] },
    ];
    vi.mocked(mockChat.getHistory).mockReturnValue(history);
    vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(800);
    vi.mocked(tokenLimit).mockReturnValue(1000);

    // Completely override the LLM client for this test
    const mockLlmClient = {
      generateContent: vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '   ' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse),
    };
    vi.mocked(mockConfig.getBaseLlmClient).mockReturnValue(
      mockLlmClient as unknown as BaseLlmClient,
    );

    const result = await service.compress(
      mockChat,
      mockPromptId,
      false,
      mockModel,
      mockConfig,
      false,
    );

    expect(result.info.compressionStatus).toBe(
      CompressionStatus.COMPRESSION_FAILED_EMPTY_SUMMARY,
    );
    expect(result.newHistory).toBeNull();
  });

  describe('Reverse Token Budget Truncation', () => {
    it('should truncate older function responses when budget is exceeded', async () => {
      vi.mocked(mockConfig.getCompressionThreshold).mockResolvedValue(0.5);
      vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(600000);

      // Large response part that exceeds budget (40k tokens).
      // Heuristic is roughly chars / 4, so 170k chars should exceed it.
      const largeResponse = 'a'.repeat(170000);

      const history: Content[] = [
        { role: 'user', parts: [{ text: 'old msg' }] },
        { role: 'model', parts: [{ text: 'old resp' }] },
        // History to keep
        { role: 'user', parts: [{ text: 'msg 1' }] },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'grep',
                response: { content: largeResponse },
              },
            },
          ],
        },
        { role: 'model', parts: [{ text: 'resp 2' }] },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'grep',
                response: { content: largeResponse },
              },
            },
          ],
        },
      ];

      vi.mocked(mockChat.getHistory).mockReturnValue(history);

      const result = await service.compress(
        mockChat,
        mockPromptId,
        true,
        mockModel,
        mockConfig,
        false,
      );

      expect(result.info.compressionStatus).toBe(CompressionStatus.COMPRESSED);

      // Verify the new history contains the truncated message
      const keptHistory = result.newHistory!.slice(2); // After summary and 'Got it'
      const truncatedPart = keptHistory[1].parts![0].functionResponse;
      expect(truncatedPart?.response?.['output']).toContain(
        'Output too large.',
      );

      // Verify a file was actually created in the tool_output subdirectory
      const toolOutputDir = path.join(testTempDir, TOOL_OUTPUTS_DIR);
      const files = fs.readdirSync(toolOutputDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toMatch(/grep_.*\.txt/);
    });

    it('should correctly handle massive single-line strings inside JSON by using multi-line Elephant Line logic', async () => {
      vi.mocked(mockConfig.getCompressionThreshold).mockResolvedValue(0.5);
      vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(600000);

      // 170,000 chars on a single line to exceed budget
      const massiveSingleLine = 'a'.repeat(170000);

      const history: Content[] = [
        { role: 'user', parts: [{ text: 'old msg 1' }] },
        { role: 'model', parts: [{ text: 'old resp 1' }] },
        { role: 'user', parts: [{ text: 'old msg 2' }] },
        { role: 'model', parts: [{ text: 'old resp 2' }] },
        { role: 'user', parts: [{ text: 'old msg 3' }] },
        { role: 'model', parts: [{ text: 'old resp 3' }] },
        { role: 'user', parts: [{ text: 'msg 1' }] },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'shell',
                response: { output: massiveSingleLine },
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'shell',
                response: { output: massiveSingleLine },
              },
            },
          ],
        },
      ];

      vi.mocked(mockChat.getHistory).mockReturnValue(history);

      const result = await service.compress(
        mockChat,
        mockPromptId,
        true,
        mockModel,
        mockConfig,
        false,
      );

      // Verify it compressed
      expect(result.newHistory).not.toBeNull();
      // Find the shell response in the kept history (the older one was truncated)
      const keptHistory = result.newHistory!.slice(2); // after summary and 'Got it'
      const shellResponse = keptHistory.find(
        (h) =>
          h.parts?.some((p) => p.functionResponse?.name === 'shell') &&
          (h.parts?.[0].functionResponse?.response?.['output'] as string)
            ?.length < 100000,
      );
      const truncatedPart = shellResponse!.parts![0].functionResponse;
      const content = truncatedPart?.response?.['output'] as string;

      // DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD = 40000 -> head=8000 (20%), tail=32000 (80%)
      expect(content).toContain(
        'Showing first 8,000 and last 32,000 characters',
      );
    });

    it('should use character-based truncation for massive single-line raw strings', async () => {
      vi.mocked(mockConfig.getCompressionThreshold).mockResolvedValue(0.5);
      vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(600000);

      const massiveRawString = 'c'.repeat(170000);

      const history: Content[] = [
        { role: 'user', parts: [{ text: 'old msg 1' }] },
        { role: 'model', parts: [{ text: 'old resp 1' }] },
        { role: 'user', parts: [{ text: 'old msg 2' }] },
        { role: 'model', parts: [{ text: 'old resp 2' }] },
        { role: 'user', parts: [{ text: 'msg 1' }] },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'raw_tool',
                response: { content: massiveRawString },
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'raw_tool',
                response: { content: massiveRawString },
              },
            },
          ],
        },
      ];

      vi.mocked(mockChat.getHistory).mockReturnValue(history);

      const result = await service.compress(
        mockChat,
        mockPromptId,
        true,
        mockModel,
        mockConfig,
        false,
      );

      expect(result.newHistory).not.toBeNull();
      const keptHistory = result.newHistory!.slice(2);
      const rawResponse = keptHistory.find(
        (h) =>
          h.parts?.some((p) => p.functionResponse?.name === 'raw_tool') &&
          (h.parts?.[0].functionResponse?.response?.['output'] as string)
            ?.length < 100000,
      );
      const truncatedPart = rawResponse!.parts![0].functionResponse;
      const content = truncatedPart?.response?.['output'] as string;

      // DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD = 40000 -> head=8000 (20%), tail=32000 (80%)
      expect(content).toContain(
        'Showing first 8,000 and last 32,000 characters',
      );
    });

    it('should fallback to original content and still update budget if truncation fails', async () => {
      vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(600000);

      const largeResponse = 'd'.repeat(170000);
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'old msg 1' }] },
        { role: 'model', parts: [{ text: 'old resp 1' }] },
        { role: 'user', parts: [{ text: 'old msg 2' }] },
        { role: 'model', parts: [{ text: 'old resp 2' }] },
        { role: 'user', parts: [{ text: 'msg 1' }] },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'grep',
                response: { content: largeResponse },
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'grep',
                response: { content: largeResponse },
              },
            },
          ],
        },
      ];

      vi.mocked(mockChat.getHistory).mockReturnValue(history);

      // Simulate failure in saving the truncated output
      vi.spyOn(fileUtils, 'saveTruncatedToolOutput').mockRejectedValue(
        new Error('Disk Full'),
      );

      const result = await service.compress(
        mockChat,
        mockPromptId,
        true,
        mockModel,
        mockConfig,
        false,
      );

      expect(result.info.compressionStatus).toBe(CompressionStatus.COMPRESSED);

      // Verify the new history contains the ORIGINAL message (not truncated)
      const keptHistory = result.newHistory!.slice(2);
      const toolResponseTurn = keptHistory.find((h) =>
        h.parts?.some((p) => p.functionResponse?.name === 'grep'),
      );
      const preservedPart = toolResponseTurn!.parts![0].functionResponse;
      expect(preservedPart?.response).toEqual({ content: largeResponse });
    });

    it('should use high-fidelity original history for summarization when under the limit, but truncated version for active window', async () => {
      // Large response in the "to compress" section (first message)
      // 300,000 chars is ~75k tokens, well under the 1,000,000 summarizer limit.
      const massiveText = 'a'.repeat(300000);
      const history: Content[] = [
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'grep',
                response: { content: massiveText },
              },
            },
          ],
        },
        // More history to ensure the first message is in the "to compress" group
        { role: 'user', parts: [{ text: 'msg 2' }] },
        { role: 'model', parts: [{ text: 'resp 2' }] },
        { role: 'user', parts: [{ text: 'preserved msg' }] },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'massive_preserved',
                response: { content: massiveText },
              },
            },
          ],
        },
      ];

      vi.mocked(mockChat.getHistory).mockReturnValue(history);
      vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(600000);
      vi.mocked(tokenLimit).mockReturnValue(1_000_000);

      const result = await service.compress(
        mockChat,
        mockPromptId,
        true,
        mockModel,
        mockConfig,
        false,
      );

      expect(result.info.compressionStatus).toBe(CompressionStatus.COMPRESSED);

      // 1. Verify that the summary was generated from the ORIGINAL high-fidelity history
      const generateContentCall = vi.mocked(
        mockConfig.getBaseLlmClient().generateContent,
      ).mock.calls[0][0];
      const historySentToSummarizer = generateContentCall.contents;

      const summarizerGrepResponse =
        historySentToSummarizer[0].parts![0].functionResponse;
      // Should be original content because total tokens < 1M
      expect(summarizerGrepResponse?.response).toEqual({
        content: massiveText,
      });

      // 2. Verify that the PRESERVED history (the active window) IS truncated
      const keptHistory = result.newHistory!.slice(2); // Skip summary + ack
      const preservedToolTurn = keptHistory.find((h) =>
        h.parts?.some((p) => p.functionResponse?.name === 'massive_preserved'),
      );
      const preservedPart = preservedToolTurn!.parts![0].functionResponse;
      expect(preservedPart?.response?.['output']).toContain(
        'Output too large.',
      );
    });

    it('should fall back to truncated history for summarization when original is massive (>1M tokens)', async () => {
      // 5,000,000 chars is ~1.25M tokens, exceeding the 1M limit.
      const superMassiveText = 'a'.repeat(5000000);
      const history: Content[] = [
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'grep',
                response: { content: superMassiveText },
              },
            },
          ],
        },
        { role: 'user', parts: [{ text: 'msg 2' }] },
        { role: 'model', parts: [{ text: 'resp 2' }] },
      ];

      vi.mocked(mockChat.getHistory).mockReturnValue(history);
      vi.mocked(tokenLimit).mockReturnValue(1_000_000);

      const result = await service.compress(
        mockChat,
        mockPromptId,
        true,
        mockModel,
        mockConfig,
        false,
      );

      expect(result.info.compressionStatus).toBe(CompressionStatus.COMPRESSED);

      // Verify that the summary was generated from the TRUNCATED history
      const generateContentCall = vi.mocked(
        mockConfig.getBaseLlmClient().generateContent,
      ).mock.calls[0][0];
      const historySentToSummarizer = generateContentCall.contents;

      const summarizerGrepResponse =
        historySentToSummarizer[0].parts![0].functionResponse;
      // Should be truncated because original > 1M tokens
      expect(summarizerGrepResponse?.response?.['output']).toContain(
        'Output too large.',
      );
    });
  });
});
