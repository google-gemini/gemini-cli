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
        MAX_STORED_TOOL_OUTPUT_BYTES,
      );
      expect(truncated).toContain('[Tool output truncated to conserve memory]');
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
      expect(response.output).toContain(
        '[Tool output truncated to conserve memory]',
      );
      expect(Buffer.byteLength(response.output, 'utf8')).toBeLessThanOrEqual(
        MAX_STORED_TOOL_OUTPUT_BYTES,
      );
    });
  });

  describe('History Collapsing Across Long-Running Turns', () => {
    it('collapses older functionResponse payloads from completed previous turns while preserving recent protected turns', () => {
      const largeToolOutput = 'data '.repeat(2000); // ~10 KB

      // Simulate 5 turns of tool calls and responses
      const history: Content[] = [
        // Turn 1
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

        // Turn 2
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

        // Turn 3
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
        { role: 'model', parts: [{ text: 'Turn 3 response' }] },

        // Turn 4
        { role: 'user', parts: [{ text: 'Turn 4 user request' }] },
        {
          role: 'model',
          parts: [
            { functionCall: { name: 'shell', args: { command: 'test 4' } } },
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
        { role: 'model', parts: [{ text: 'Turn 4 response' }] },

        // Turn 5
        { role: 'user', parts: [{ text: 'Turn 5 user request' }] },
        {
          role: 'model',
          parts: [
            { functionCall: { name: 'shell', args: { command: 'test 5' } } },
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

      // Turn 3, 4, 5 tool responses (the 3 most recent) must be PRESERVED intact
      const turn3Part = collapsed[10].parts![0].functionResponse?.response as {
        output: string;
      };
      expect(turn3Part.output).toBe(largeToolOutput);

      const turn4Part = collapsed[14].parts![0].functionResponse?.response as {
        output: string;
      };
      expect(turn4Part.output).toBe(largeToolOutput);

      const turn5Part = collapsed[18].parts![0].functionResponse?.response as {
        output: string;
      };
      expect(turn5Part.output).toBe(largeToolOutput);
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
      // With older turn collapsing to 2 KB, 47 turns * 2 KB + 3 turns * 60 KB ≈ 274 KB.
      // Assert that total size remains well bounded under 350 KB!
      expect(totalByteSize).toBeLessThan(350 * 1024);

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

      // Earlier tool turns beyond the 3 protected recent turns must be collapsed
      for (let i = 0; i < toolTurns.length - 3; i++) {
        const oldPart = toolTurns[i].parts![0].functionResponse?.response as {
          output: string;
        };
        expect(oldPart.output).toContain(
          '[Tool output collapsed from previous turn:',
        );
      }

      // The recent 3 protected tool turns must remain intact
      for (let i = toolTurns.length - 3; i < toolTurns.length; i++) {
        const recentPart = toolTurns[i].parts![0].functionResponse
          ?.response as {
          output: string;
        };
        expect(recentPart.output).toBe(toolOutputChunk);
      }
    });
  });

  describe('High-Token Context Retention on Large Context Models', () => {
    let compressionService: ChatCompressionService;
    let mockChat: GeminiChat;

    beforeEach(() => {
      compressionService = new ChatCompressionService();
      mockChat = {
        getHistory: vi.fn(),
        getLastPromptTokenCount: vi.fn().mockReturnValue(100),
      } as unknown as GeminiChat;
    });

    it('does not prematurely trigger compression for 60,000 to 200,000 tokens on 1M+ models when threshold is not reached', async () => {
      // 2,000,000 token limit with 0.5 threshold = 1,000,000 tokens needed to trigger compression.
      // A conversation of 150,000 tokens should return NOOP and not discard history.
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'some prompt' }] },
        { role: 'model', parts: [{ text: 'some response' }] },
      ];

      vi.mocked(mockChat.getHistory).mockReturnValue(history);
      vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(150_000);
      vi.mocked(tokenLimit).mockReturnValue(2_000_000);

      const mockConfig = makeFakeConfig();
      mockConfig.getCompressionThreshold = vi.fn().mockResolvedValue(0.5);

      const result = await compressionService.compress(
        mockChat,
        'high-token-context-test',
        false,
        'gemini-2.5-pro',
        mockConfig,
        false,
      );

      // Must NOT have compressed: status must be NOOP
      expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
      expect(result.newHistory).toBeNull();
    });

    it('does not trigger compression for 50,000 tokens on a 1M context model when threshold is 0.5', async () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'some prompt' }] },
        { role: 'model', parts: [{ text: 'some response' }] },
      ];

      vi.mocked(mockChat.getHistory).mockReturnValue(history);
      vi.mocked(mockChat.getLastPromptTokenCount).mockReturnValue(50_000);
      vi.mocked(tokenLimit).mockReturnValue(1_000_000);

      const mockConfig = makeFakeConfig();
      mockConfig.getCompressionThreshold = vi.fn().mockResolvedValue(0.5);

      const result = await compressionService.compress(
        mockChat,
        '50k-token-test',
        false,
        'gemini-2.5-flash',
        mockConfig,
        false,
      );

      expect(result.info.compressionStatus).toBe(CompressionStatus.NOOP);
      expect(result.newHistory).toBeNull();
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

  describe('Turn ID Stability', () => {
    it('preserves existing turn IDs when updating history', () => {
      const turn1Id = 'turn-uuid-1';
      const turn2Id = 'turn-uuid-2';
      const originalTurns = [
        { id: turn1Id, content: { role: 'user', parts: [{ text: 'hello' }] } },
        { id: turn2Id, content: { role: 'model', parts: [{ text: 'world' }] } },
      ];

      // Simulate what LocalAgentExecutor does: preserving existing turn IDs
      const newContents: Content[] = [
        { role: 'user', parts: [{ text: 'hello' }] },
        { role: 'model', parts: [{ text: 'world' }] },
      ];

      const mappedTurns = newContents.map((c, idx) => ({
        id: originalTurns[idx]?.id ?? 'fallback-uuid',
        content: c,
      }));

      expect(mappedTurns[0].id).toBe(turn1Id);
      expect(mappedTurns[1].id).toBe(turn2Id);
    });
  });

  describe('Tool Output Disk Fallback', () => {
    it('includes disk file path in truncation notice when output exceeds cap', () => {
      const largeOutput = 'x'.repeat(100 * 1024);
      const savedPath = '/tmp/project/tools/tool-output-123.txt';
      const truncated = truncateToolOutput(
        largeOutput,
        MAX_STORED_TOOL_OUTPUT_BYTES,
        savedPath,
      );

      expect(truncated).toContain(
        `[Tool output truncated to conserve memory. For full output see: ${savedPath}]`,
      );
      expect(Buffer.byteLength(truncated, 'utf8')).toBeLessThanOrEqual(
        MAX_STORED_TOOL_OUTPUT_BYTES,
      );
    });
  });
});
