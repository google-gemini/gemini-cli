/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import { MAX_STORED_TOOL_OUTPUT_BYTES } from '../utils/constants.js';
import { LoggingContentGenerator } from '../core/loggingContentGenerator.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { LlmRole } from '../telemetry/types.js';
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
import { ToolOutputMaskingService } from '../context/toolOutputMaskingService.js';
import { convertToFunctionResponse } from '../utils/generateContentResponseUtilities.js';
import { ToolExecutor } from '../scheduler/tool-executor.js';
import {
  CoreToolCallStatus,
  type ScheduledToolCall,
} from '../scheduler/types.js';
import { MockTool } from '../test-utils/mock-tool.js';
import type { AnyToolInvocation } from '../index.js';
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

  describe('GH-29830 Heap Out-of-Memory Regression Tests', () => {
    it('bounds total joined response output when a tool returns an array of sub-64KB parts (read_many_files pattern)', async () => {
      const config = makeFakeConfig();
      vi.spyOn(config, 'isContextManagementEnabled').mockReturnValue(false);
      vi.spyOn(config.storage, 'getProjectTempDir').mockReturnValue(
        os.tmpdir(),
      );
      const executor = new ToolExecutor(config);

      // 20 parts of 50 KB each: each individual element is < MAX_STORED_TOOL_OUTPUT_BYTES (64 KB),
      // but convertToFunctionResponse joins them into a single 1,000 KB (~1 MB) output string.
      const subCapChunk = 'A'.repeat(50 * 1024);
      const multiFileParts: Part[] = Array.from({ length: 20 }, (_, i) => ({
        text: `--- file-${i}.json ---\n${subCapChunk}`,
      }));

      const mockTool = new MockTool({
        name: 'read_many_files',
        description: 'Reads multiple files',
        execute: async () => ({
          llmContent: multiFileParts,
          returnDisplay: 'Read 20 files',
        }),
      });
      const invocation = mockTool.build({});

      const scheduledCall: ScheduledToolCall = {
        status: CoreToolCallStatus.Scheduled,
        request: {
          callId: 'call-read-many',
          name: 'read_many_files',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-read-many',
        },
        tool: mockTool,
        invocation: invocation as unknown as AnyToolInvocation,
        startTime: Date.now(),
      };

      const result = await executor.execute({
        call: scheduledCall,
        signal: new AbortController().signal,
        onUpdateToolCall: vi.fn(),
      });

      expect(result.status).toBe(CoreToolCallStatus.Success);
      if (result.status === CoreToolCallStatus.Success) {
        const response = result.response.responseParts[0]?.functionResponse
          ?.response as { output: string };
        expect(response?.output).toBeDefined();
        expect(Buffer.byteLength(response.output, 'utf8')).toBeLessThanOrEqual(
          MAX_STORED_TOOL_OUTPUT_BYTES,
        );
        expect(result.response.outputFile).toBeDefined();
        if (result.response.outputFile) {
          const savedDiskContent = fs.readFileSync(
            result.response.outputFile,
            'utf8',
          );
          expect(savedDiskContent).toContain('--- file-0.json ---');
          expect(savedDiskContent).toContain('--- file-19.json ---');
        }
      }
    });

    it('strictly bounds joined response output when the first array part leaves fewer bytes than the truncation suffix', async () => {
      const config = makeFakeConfig();
      vi.spyOn(config, 'isContextManagementEnabled').mockReturnValue(false);
      const executor = new ToolExecutor(config);

      // Part 0 uses 65,500 bytes (leaving only 35 bytes before the 65,536 byte cap,
      // which is smaller than the ~100-byte truncation suffix).
      const nearCapPart = 'A'.repeat(MAX_STORED_TOOL_OUTPUT_BYTES - 36);
      const overflowPart = 'B'.repeat(10 * 1024);

      const mockTool = new MockTool({
        name: 'read_many_files',
        description: 'Reads multiple files near boundary',
        execute: async () => ({
          llmContent: [{ text: nearCapPart }, { text: overflowPart }],
          returnDisplay: 'Read 2 files',
        }),
      });
      const invocation = mockTool.build({});

      const scheduledCall: ScheduledToolCall = {
        status: CoreToolCallStatus.Scheduled,
        request: {
          callId: 'call-read-many-boundary',
          name: 'read_many_files',
          args: {},
          isClientInitiated: false,
          prompt_id: 'prompt-read-many-boundary',
        },
        tool: mockTool,
        invocation: invocation as unknown as AnyToolInvocation,
        startTime: Date.now(),
      };

      const result = await executor.execute({
        call: scheduledCall,
        signal: new AbortController().signal,
        onUpdateToolCall: vi.fn(),
      });

      expect(result.status).toBe(CoreToolCallStatus.Success);
      if (result.status === CoreToolCallStatus.Success) {
        const response = result.response.responseParts[0]?.functionResponse
          ?.response as { output: string };
        expect(response?.output).toBeDefined();
        expect(Buffer.byteLength(response.output, 'utf8')).toBeLessThanOrEqual(
          MAX_STORED_TOOL_OUTPUT_BYTES,
        );
      }
    });

    it('accounts for nested functionResponse.parts inlineData (Gemini 3 multimodal responses) in calculateHistoryByteSize', () => {
      const base64Image = 'B'.repeat(512 * 1024); // 512 KB base64 payload
      const gemini3ResponseParts = convertToFunctionResponse(
        'read_file',
        'call-img-1',
        [{ inlineData: { mimeType: 'image/png', data: base64Image } }],
        'gemini-3-pro',
      );

      const history: Content[] = [
        { role: 'user', parts: gemini3ResponseParts },
      ];
      const calculatedBytes = calculateHistoryByteSize(history);

      expect(calculatedBytes).toBeGreaterThanOrEqual(
        Buffer.byteLength(base64Image, 'utf8'),
      );
    });

    it('collapses older multimodal inlineData payloads (both nested functionResponse.parts and sibling inlineData) outside recent protected turns', () => {
      const base64Image = 'I'.repeat(256 * 1024); // 256 KB per image
      const history: Content[] = [];

      // Simulate 6 turns of multimodal tool responses (3 older prunable turns + 3 recent protected turns)
      for (let turn = 1; turn <= 6; turn++) {
        history.push(
          { role: 'user', parts: [{ text: `Turn ${turn} request` }] },
          {
            role: 'model',
            parts: [
              {
                functionCall: {
                  name: 'shell',
                  args: { command: `capture-${turn}` },
                  id: `call-${turn}`,
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
                  id: `call-${turn}`,
                  response: { output: 'Binary content provided (1 item(s)).' },
                  parts: [
                    {
                      inlineData: { mimeType: 'image/png', data: base64Image },
                    },
                  ],
                },
              },
              { inlineData: { mimeType: 'image/png', data: base64Image } },
            ],
          },
          { role: 'model', parts: [{ text: `Turn ${turn} analyzed` }] },
        );
      }

      const collapsed = collapseOlderFunctionResponses(
        history,
        COLLAPSED_FUNCTION_RESPONSE_MAX_BYTES,
      );

      // Turns 1, 2, 3 (indices 2, 6, 10) must not retain raw inlineData in functionResponse.parts or sibling parts
      for (const turnIdx of [2, 6, 10]) {
        const parts = collapsed[turnIdx].parts ?? [];
        const hasNestedInlineData = parts.some((p) =>
          p.functionResponse?.parts?.some((fp) => fp.inlineData !== undefined),
        );
        const hasSiblingInlineData = parts.some(
          (p) => p.inlineData !== undefined,
        );
        expect(hasNestedInlineData).toBe(false);
        expect(hasSiblingInlineData).toBe(false);
      }

      // Turns 4, 5, 6 (indices 14, 18, 22 - the 3 recent protected turns) must preserve inlineData intact
      for (const turnIdx of [14, 18, 22]) {
        const parts = collapsed[turnIdx].parts ?? [];
        const hasNestedInlineData = parts.some((p) =>
          p.functionResponse?.parts?.some((fp) => fp.inlineData !== undefined),
        );
        const hasSiblingInlineData = parts.some(
          (p) => p.inlineData !== undefined,
        );
        expect(hasNestedInlineData).toBe(true);
        expect(hasSiblingInlineData).toBe(true);
      }
    });

    it('masks older multimodal functionResponse.parts inlineData in ToolOutputMaskingService instead of aborting with zero savings', async () => {
      const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'gh-29830-masking-'),
      );
      try {
        const maskingService = new ToolOutputMaskingService();
        const mockConfig = makeFakeConfig();
        vi.spyOn(mockConfig.storage, 'getHistoryDir').mockReturnValue(
          path.join(tempDir, 'history'),
        );
        vi.spyOn(mockConfig.storage, 'getProjectTempDir').mockReturnValue(
          tempDir,
        );
        vi.spyOn(mockConfig, 'getToolOutputMaskingConfig').mockResolvedValue({
          protectionThresholdTokens: 3000, // 1 image protected
          minPrunableThresholdTokens: 3000, // 1+ image triggers masking
          protectLatestTurn: true,
        });

        const base64Image = 'M'.repeat(256 * 1024);
        const history: Content[] = [];
        for (let turn = 1; turn <= 4; turn++) {
          const mediaParts = convertToFunctionResponse(
            'read_file',
            `call-img-${turn}`,
            [{ inlineData: { mimeType: 'image/png', data: base64Image } }],
            'gemini-3-pro',
          );
          history.push(
            {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'read_file',
                    args: { file_path: `img-${turn}.png` },
                    id: `call-img-${turn}`,
                  },
                },
              ],
            },
            { role: 'user', parts: mediaParts },
          );
        }

        const result = await maskingService.mask(history, mockConfig);

        expect(result.maskedCount).toBeGreaterThan(0);
        expect(result.tokensSaved).toBeGreaterThan(0);
        const oldestUserTurn = result.newHistory[1];
        const nestedInlineData =
          oldestUserTurn.parts?.[0]?.functionResponse?.parts?.some(
            (p) => p.inlineData !== undefined,
          ) ?? false;
        expect(nestedInlineData).toBe(false);
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('keeps history byte growth bounded across 50 simulated retrieval tool turns (read_many_files)', () => {
      let currentHistory: Content[] = [];
      const toolOutputChunk = 'R'.repeat(60 * 1024); // 60 KB per turn

      for (let turn = 1; turn <= 50; turn++) {
        currentHistory.push({
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'read_many_files',
                args: { paths: [`allure-result-${turn}.json`] },
              },
            },
          ],
        });

        const cappedPart = truncateFunctionResponsePart({
          functionResponse: {
            name: 'read_many_files',
            response: { output: toolOutputChunk },
          },
        });
        currentHistory.push({
          role: 'user',
          parts: [cappedPart],
        });

        currentHistory.push({
          role: 'model',
          parts: [{ text: `Turn ${turn} completed.` }],
        });

        currentHistory = collapseOlderFunctionResponses(currentHistory);
      }

      const totalByteSize = calculateHistoryByteSize(currentHistory);

      // Without collapsing retrieval tools, 50 turns * 60 KB = 3,000 KB (3 MB).
      // Older turns beyond the recent window must be collapsed so total size stays bounded under 350 KB.
      expect(totalByteSize).toBeLessThan(350 * 1024);
    });
  });

  describe('GH-29591 PDF Ingestion & Telemetry Buffer Heap OOM Regression Tests', () => {
    it('does not retain evicted PDF inlineData or leak serialized requestText in telemetryBuffer across turns when telemetry is disabled', async () => {
      v8.setFlagsFromString('--expose_gc');
      const gc = vm.runInNewContext('gc') as () => void;

      const config = makeFakeConfig();
      vi.spyOn(config, 'getTelemetryEnabled').mockReturnValue(false);
      vi.spyOn(config, 'getTelemetryLogPromptsEnabled').mockReturnValue(false);
      vi.spyOn(config, 'getTelemetryTracesEnabled').mockReturnValue(false);

      const wrappedGenerator: ContentGenerator = {
        generateContent: async () => ({
          candidates: [],
          text: undefined,
          functionCalls: undefined,
          executableCode: undefined,
          codeExecutionResult: undefined,
          data: undefined,
        }),
        generateContentStream: async () =>
          (async function* () {
            yield {
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [{ text: 'Created wiki page.' }],
                  },
                },
              ],
              usageMetadata: {
                promptTokenCount: 52000,
                candidatesTokenCount: 25,
                totalTokenCount: 52025,
              },
              text: undefined,
              functionCalls: undefined,
              executableCode: undefined,
              codeExecutionResult: undefined,
              data: undefined,
            };
          })(),
        countTokens: async () => ({ totalTokens: 52000 }),
        embedContent: async () => ({ embeddings: [] }),
      };

      const loggingGenerator = new LoggingContentGenerator(
        wrappedGenerator,
        config,
      );

      gc();
      const baselineHeapBytes = process.memoryUsage().heapUsed;

      // Allocate two 2 MB base64 PDF payloads inside an isolated scope so only
      // conversation history (and any internal leaks) can hold references to them.
      const createInitialPdfSession = (): {
        history: Content[];
        pdfPartRef: WeakRef<Part>;
      } => {
        const pdf1Part: Part = {
          inlineData: {
            mimeType: 'application/pdf',
            data: Buffer.alloc(1.5 * 1024 * 1024, 'A').toString('base64'),
          },
        };
        const pdf2Part: Part = {
          inlineData: {
            mimeType: 'application/pdf',
            data: Buffer.alloc(1.5 * 1024 * 1024, 'B').toString('base64'),
          },
        };
        return {
          history: [
            {
              role: 'user',
              parts: [
                pdf1Part,
                pdf2Part,
                { text: 'Ingest these two 80-slide PDFs into wiki pages.' },
              ],
            },
          ],
          pdfPartRef: new WeakRef(pdf1Part),
        };
      };

      let { history, pdfPartRef } = createInitialPdfSession();

      // Simulate 6 agent tool turns (3 protected turns + 3 turns after collapse)
      for (let turn = 1; turn <= 6; turn++) {
        history.push(
          {
            role: 'model',
            parts: [
              {
                functionCall: {
                  name: 'write_file',
                  args: {
                    path: `wiki/page-${turn}.md`,
                    content: `# Page ${turn}`,
                  },
                },
              },
            ],
          },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'write_file',
                  response: { output: 'Successfully wrote file.' },
                },
              },
            ],
          },
        );

        history = collapseOlderFunctionResponses(history);

        const stream = await loggingGenerator.generateContentStream(
          {
            model: 'gemini-3-flash-preview',
            contents: history,
          },
          `prompt-gh-29591########${turn}`,
          LlmRole.MAIN,
        );
        for await (const _chunk of stream) {
          // consume stream
        }
      }

      // Active history has already evicted the PDF inlineData (< 2 KB remaining)
      expect(calculateHistoryByteSize(history)).toBeLessThan(2 * 1024);

      // Allow microtasks/finalizers to settle and run V8 garbage collection
      await new Promise((resolve) => setTimeout(resolve, 10));
      gc();

      const retainedHeapDeltaBytes =
        process.memoryUsage().heapUsed - baselineHeapBytes;

      // The evicted PDF Part must be eligible for garbage collection (not pinned in telemetryBuffer)
      expect(pdfPartRef.deref() === undefined).toBe(true);
      // Heap growth after PDF eviction must remain bounded (< 4 MB), not ~16+ MB of leaked JSON.stringify copies
      expect(retainedHeapDeltaBytes).toBeLessThan(4 * 1024 * 1024);
    });

    it('truncates older multimodal inlineData in ChatCompressionService.compress budget truncation path', async () => {
      const compressionService = new ChatCompressionService();
      const base64Pdf = 'P'.repeat(512 * 1024); // 512 KB base64 PDF payload each

      // Simulate 2 PDF tool turns (2 * 25,800 = 51,600 tokens > COMPRESSION_FUNCTION_RESPONSE_TOKEN_BUDGET of 30,000)
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Ingest deck1.pdf and deck2.pdf' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'read_file',
                args: { file_path: 'deck1.pdf' },
                id: 'call-pdf-1',
              },
            },
          ],
        },
        {
          role: 'user',
          parts: convertToFunctionResponse(
            'read_file',
            'call-pdf-1',
            [{ inlineData: { mimeType: 'application/pdf', data: base64Pdf } }],
            'gemini-3-flash-preview',
          ),
        },
        { role: 'model', parts: [{ text: 'Read deck1.pdf.' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'read_file',
                args: { file_path: 'deck2.pdf' },
                id: 'call-pdf-2',
              },
            },
          ],
        },
        {
          role: 'user',
          parts: convertToFunctionResponse(
            'read_file',
            'call-pdf-2',
            [{ inlineData: { mimeType: 'application/pdf', data: base64Pdf } }],
            'gemini-3-flash-preview',
          ),
        },
        { role: 'model', parts: [{ text: 'Read deck2.pdf.' }] },
      ];

      const mockChat = {
        getHistory: vi.fn().mockReturnValue(history),
        getLastPromptTokenCount: vi.fn().mockReturnValue(600_000),
      } as unknown as GeminiChat;

      vi.mocked(tokenLimit).mockReturnValue(1_000_000);
      const mockConfig = makeFakeConfig();
      mockConfig.getCompressionThreshold = vi.fn().mockResolvedValue(0.5);

      // When summarization has previously failed (e.g. 429 quota exhausted), compress() relies on truncateHistoryToBudget
      const result = await compressionService.compress(
        mockChat,
        'gh-29591-compress-test',
        false,
        'gemini-3-flash-preview',
        mockConfig,
        true,
      );

      expect(result.info.compressionStatus).toBe(
        CompressionStatus.CONTENT_TRUNCATED,
      );
      expect(result.newHistory).not.toBeNull();
      // The older PDF (turn index 2) exceeds the 30,000 token budget and must have its 512 KB inlineData stripped
      const olderPdfTurn = result.newHistory![2];
      const hasOlderInlineData =
        olderPdfTurn.parts?.some(
          (p) =>
            p.inlineData !== undefined ||
            p.functionResponse?.parts?.some(
              (fp) => fp.inlineData !== undefined,
            ),
        ) ?? false;
      expect(hasOlderInlineData).toBe(false);
      expect(calculateHistoryByteSize(result.newHistory!)).toBeLessThan(
        600 * 1024,
      );
    });
  });
});
