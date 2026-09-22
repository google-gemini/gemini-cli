/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MAX_STORED_TOOL_OUTPUT_BYTES } from '../utils/constants.js';
import {
  truncateToolOutput,
  truncateFunctionResponsePart,
} from '../utils/tool-utils.js';
import {
  calculateHistoryByteSize,
  collapseOlderFunctionResponses,
  COMPRESSION_SAFETY_WATERMARK_BYTES,
  COMPRESSION_SAFETY_WATERMARK_TOKENS,
  COLLAPSED_FUNCTION_RESPONSE_MAX_BYTES,
  ChatCompressionService,
} from '../context/chatCompressionService.js';
import type { Content, Part } from '@google/genai';
import type { GeminiChat } from '../core/geminiChat.js';
import { CompressionStatus } from '../core/turn.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { tokenLimit } from '../core/tokenLimits.js';

vi.mock('../core/tokenLimits.js', () => ({
  tokenLimit: vi.fn().mockReturnValue(1_000_000),
}));

describe('GH-28537 / b/561554750 Memory Leak Regression Tests', () => {
  describe('Tool Output Truncation Cap', () => {
    it('truncates tool outputs exceeding MAX_STORED_TOOL_OUTPUT_BYTES (64 KB)', () => {
      const largeOutput = 'x'.repeat(100 * 1024); // 100 KB
      const truncated = truncateToolOutput(
        largeOutput,
        MAX_STORED_TOOL_OUTPUT_BYTES,
      );

      expect(Buffer.byteLength(truncated, 'utf8')).toBeLessThanOrEqual(
        MAX_STORED_TOOL_OUTPUT_BYTES + 256,
      );
      expect(truncated).toContain('[Tool output truncated:');
      expect(truncated).toContain('omitted to conserve memory');
    });

    it('preserves tool outputs within MAX_STORED_TOOL_OUTPUT_BYTES', () => {
      const smallOutput = 'hello world';
      const result = truncateToolOutput(
        smallOutput,
        MAX_STORED_TOOL_OUTPUT_BYTES,
      );
      expect(result).toBe(smallOutput);
    });

    it('truncates function response parts with large string or object outputs', () => {
      const largeOutput = 'A'.repeat(80 * 1024);
      const part: Part = {
        functionResponse: {
          name: 'shell',
          response: {
            output: largeOutput,
          },
        },
      };

      const truncatedPart = truncateFunctionResponsePart(
        part,
        MAX_STORED_TOOL_OUTPUT_BYTES,
      );
      const response = truncatedPart.functionResponse?.response as {
        output: string;
      };
      expect(response).toBeDefined();
      expect(response.output).toContain('[Tool output truncated:');
      expect(Buffer.byteLength(response.output, 'utf8')).toBeLessThanOrEqual(
        MAX_STORED_TOOL_OUTPUT_BYTES + 256,
      );
    });
  });

  describe('History Collapsing Across Long-Running Turns', () => {
    it('collapses older functionResponse payloads from completed previous turns while preserving the latest turn', () => {
      const largeToolOutput = 'data '.repeat(2000); // ~10 KB

      // Simulate 5 turns of tool calls and responses
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Turn 1 user request' }] },
        {
          role: 'model',
          parts: [
            { functionCall: { name: 'shell', args: { command: 'test 1' } } },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'shell',
                response: { output: largeToolOutput },
              },
            },
          ],
        },
        { role: 'model', parts: [{ text: 'Turn 1 response' }] },
        { role: 'user', parts: [{ text: 'Turn 2 user request' }] },
        {
          role: 'model',
          parts: [
            { functionCall: { name: 'shell', args: { command: 'test 2' } } },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'shell',
                response: { output: largeToolOutput },
              },
            },
          ],
        },
        { role: 'model', parts: [{ text: 'Turn 2 response' }] },
        { role: 'user', parts: [{ text: 'Turn 3 user request' }] },
        {
          role: 'model',
          parts: [
            { functionCall: { name: 'shell', args: { command: 'test 3' } } },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'shell',
                response: { output: largeToolOutput },
              },
            },
          ],
        },
      ];

      const collapsed = collapseOlderFunctionResponses(
        history,
        COLLAPSED_FUNCTION_RESPONSE_MAX_BYTES,
      );

      // Turn 1 tool response (index 2) should be collapsed
      const turn1Part = collapsed[2].parts![0].functionResponse?.response as {
        output: string;
      };
      expect(turn1Part.output).toContain(
        '[Tool output collapsed from previous turn:',
      );
      expect(Buffer.byteLength(turn1Part.output, 'utf8')).toBeLessThanOrEqual(
        COLLAPSED_FUNCTION_RESPONSE_MAX_BYTES + 256,
      );

      // Turn 2 tool response (index 6) should be collapsed
      const turn2Part = collapsed[6].parts![0].functionResponse?.response as {
        output: string;
      };
      expect(turn2Part.output).toContain(
        '[Tool output collapsed from previous turn:',
      );

      // Turn 3 tool response (index 10, the most recent) must be PRESERVED intact
      const turn3Part = collapsed[10].parts![0].functionResponse?.response as {
        output: string;
      };
      expect(turn3Part.output).toBe(largeToolOutput);
    });

    it('keeps history byte growth bounded across 50 simulated tool turns', () => {
      let currentHistory: Content[] = [];
      const toolOutputChunk = 'x'.repeat(60 * 1024); // 60 KB output per turn

      for (let turn = 1; turn <= 50; turn++) {
        // Model tool call turn
        currentHistory.push({
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'shell',
                args: { command: `run-test-${turn}` },
              },
            },
          ],
        });

        // User tool response turn (capped at 64 KB initially)
        const cappedPart = truncateFunctionResponsePart({
          functionResponse: {
            name: 'shell',
            response: { output: toolOutputChunk },
          },
        });
        currentHistory.push({
          role: 'user',
          parts: [cappedPart],
        });

        // Model text response turn
        currentHistory.push({
          role: 'model',
          parts: [{ text: `Turn ${turn} completed.` }],
        });

        // Apply older turn collapsing as done during local executor turns
        currentHistory = collapseOlderFunctionResponses(currentHistory);
      }

      const totalByteSize = calculateHistoryByteSize(currentHistory);

      // 50 turns with 60 KB uncollapsed would be 3,000 KB (3 MB).
      // With older turn collapsing to 2 KB, 49 turns * 2 KB + 1 turn * 60 KB ≈ 160 KB.
      // Assert that total size remains well under 250 KB!
      expect(totalByteSize).toBeLessThan(250 * 1024);

      // The latest tool response must still be intact
      const toolTurns = currentHistory.filter(
        (c) =>
          c.role === 'user' &&
          c.parts?.some((p) => p.functionResponse?.name === 'shell'),
      );
      const latestToolTurn = toolTurns[toolTurns.length - 1];
      const latestPart = latestToolTurn.parts![0].functionResponse
        ?.response as {
        output: string;
      };
      expect(latestPart.output).toBe(toolOutputChunk);

      // Earlier tool turns must all be collapsed
      for (let i = 0; i < toolTurns.length - 1; i++) {
        const oldPart = toolTurns[i].parts![0].functionResponse?.response as {
          output: string;
        };
        expect(oldPart.output).toContain(
          '[Tool output collapsed from previous turn:',
        );
      }
    });
  });

  describe('Automatic Compression Trigger on Safety Watermarks', () => {
    let compressionService: ChatCompressionService;
    let mockChat: GeminiChat;

    beforeEach(() => {
      compressionService = new ChatCompressionService();
      mockChat = {
        getHistory: vi.fn(),
        getLastPromptTokenCount: vi.fn().mockReturnValue(100),
      } as unknown as GeminiChat;
    });

    it('has expected safety watermark thresholds configured', () => {
      expect(COMPRESSION_SAFETY_WATERMARK_BYTES).toBe(512 * 1024);
      expect(COMPRESSION_SAFETY_WATERMARK_TOKENS).toBe(50_000);
    });

    it('triggers compression when stored history byte size exceeds COMPRESSION_SAFETY_WATERMARK_BYTES (512 KB) even when token threshold is not met', async () => {
      // 1,000,000 token limit with 0.5 threshold = 500,000 tokens needed normally.
      // Here tokens are only 10,000 (well below 500,000), but byte size exceeds 512 KB.
      const largeText = 'A'.repeat(600 * 1024); // 600 KB
      const history: Content[] = [
        { role: 'user', parts: [{ text: largeText }] },
        { role: 'model', parts: [{ text: 'Acknowledged large payload' }] },
      ];

      vi.mocked(mockChat.getHistory).mockReturnValue(history);
      vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(10_000);
      vi.mocked(tokenLimit).mockReturnValue(1_000_000);

      const mockConfig = makeFakeConfig();
      mockConfig.getCompressionThreshold = vi.fn().mockResolvedValue(0.5);

      const mockGenerateContent = vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: 'Compressed summary of large history' }],
            },
          },
        ],
      });
      mockConfig.getBaseLlmClient = vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      });

      const result = await compressionService.compress(
        mockChat,
        'watermark-test',
        false, // force = false
        'gemini-2.5-pro',
        mockConfig,
        false,
      );

      // Must have triggered compression instead of returning NOOP!
      expect(result.info.compressionStatus).not.toBe(CompressionStatus.NOOP);
      expect(result.newHistory).toBeDefined();
    });

    it('triggers compression when estimated token count exceeds COMPRESSION_SAFETY_WATERMARK_TOKENS (50,000)', async () => {
      // 2,000,000 token limit with 0.5 threshold = 1,000,000 tokens needed normally.
      // Here token count is 60,000 (exceeds 50,000 watermark, but well below 1,000,000).
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'some prompt' }] },
        { role: 'model', parts: [{ text: 'some response' }] },
      ];

      vi.mocked(mockChat.getHistory).mockReturnValue(history);
      vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(60_000);
      vi.mocked(tokenLimit).mockReturnValue(2_000_000);

      const mockConfig = makeFakeConfig();
      mockConfig.getCompressionThreshold = vi.fn().mockResolvedValue(0.5);

      const mockGenerateContent = vi.fn().mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: 'Compressed summary' }],
            },
          },
        ],
      });
      mockConfig.getBaseLlmClient = vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      });

      const result = await compressionService.compress(
        mockChat,
        'watermark-tokens-test',
        false,
        'gemini-2.5-pro',
        mockConfig,
        false,
      );

      // Must have triggered compression instead of returning NOOP!
      expect(result.info.compressionStatus).not.toBe(CompressionStatus.NOOP);
    });

    it('returns NOOP when both tokens and bytes are below watermarks and model threshold', async () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'small text' }] },
        { role: 'model', parts: [{ text: 'small response' }] },
      ];

      vi.mocked(mockChat.getHistory).mockReturnValue(history);
      vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(500);
      vi.mocked(tokenLimit).mockReturnValue(1_000_000);

      const mockConfig = makeFakeConfig();
      mockConfig.getCompressionThreshold = vi.fn().mockResolvedValue(0.5);

      const result = await compressionService.compress(
        mockChat,
        'noop-test',
        false,
        'gemini-2.5-pro',
        mockConfig,
        false,
      );

      expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
      expect(result.newHistory).toBeNull();
    });
  });
});
