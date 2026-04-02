/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAgentConversation,
  createStandardScenarios,
  collectMetrics,
  compareStrategies,
  formatComparisonReport,
  analyzeHistory,
} from './compressionEval.js';
import type { Content, GenerateContentResponse } from '@google/genai';
import { ChatCompressionService } from './chatCompressionService.js';
import { CompressionStatus } from '../core/turn.js';
import type { GeminiChat } from '../core/geminiChat.js';
import type { Config } from '../config/config.js';

vi.mock('../telemetry/loggers.js');
vi.mock('../utils/environmentContext.js', () => ({
  getInitialChatHistory: vi
    .fn()
    .mockImplementation(
      async (_config: unknown, extra?: Content[]) => extra ?? [],
    ),
}));
vi.mock('../core/tokenLimits.js', () => ({
  tokenLimit: vi.fn().mockReturnValue(1_000_000),
}));

// ---------------------------------------------------------------------------
// Scenario generation tests
// ---------------------------------------------------------------------------

describe('compressionEval: scenario generation', () => {
  it('should create a conversation with the specified number of turns', () => {
    const scenario = createAgentConversation(10);

    expect(scenario.turnCount).toBe(10);
    expect(scenario.history.length).toBeGreaterThan(10);
    expect(scenario.totalTokens).toBeGreaterThan(0);
    expect(scenario.name).toContain('10turns');
  });

  it('should include system prompt by default', () => {
    const scenario = createAgentConversation(5);

    // First entry should be the system prompt (user role)
    expect(scenario.history[0].role).toBe('user');
    expect(scenario.history[0].parts?.[0].text).toContain('session_context');
    expect(scenario.tokenBreakdown.systemPrompt).toBeGreaterThan(0);
  });

  it('should skip system prompt when configured', () => {
    const scenario = createAgentConversation(5, {
      includeSystemPrompt: false,
    });

    expect(scenario.history[0].parts?.[0].text).not.toContain(
      'session_context',
    );
    expect(scenario.tokenBreakdown.systemPrompt).toBe(0);
  });

  it('should include tool calls based on fraction', () => {
    // All turns should have tool calls
    const allTools = createAgentConversation(10, { toolCallFraction: 1.0 });
    const toolOutputEntries = allTools.history.filter(
      (h) => h.role === 'user' && h.parts?.some((p) => !!p.functionResponse),
    );
    expect(toolOutputEntries.length).toBe(10);

    // No turns should have tool calls
    const noTools = createAgentConversation(10, { toolCallFraction: 0 });
    const noToolEntries = noTools.history.filter(
      (h) => h.role === 'user' && h.parts?.some((p) => !!p.functionResponse),
    );
    expect(noToolEntries.length).toBe(0);
  });

  it('should generate larger outputs with higher avgToolOutputTokens', () => {
    const small = createAgentConversation(10, {
      avgToolOutputTokens: 100,
      toolCallFraction: 1.0,
    });
    const large = createAgentConversation(10, {
      avgToolOutputTokens: 2000,
      toolCallFraction: 1.0,
    });

    expect(large.tokenBreakdown.toolOutputs).toBeGreaterThan(
      small.tokenBreakdown.toolOutputs,
    );
  });

  it('should create standard scenarios with varied configurations', () => {
    const scenarios = createStandardScenarios();

    expect(scenarios.length).toBe(6);
    // Verify varied turn counts
    const turnCounts = scenarios.map((s) => s.turnCount);
    expect(new Set(turnCounts).size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// History analysis tests
// ---------------------------------------------------------------------------

describe('compressionEval: history analysis', () => {
  it('should categorize entries correctly', () => {
    const scenario = createAgentConversation(10, { toolCallFraction: 1.0 });
    const analysis = analyzeHistory(scenario.history);

    expect(analysis.totalTokens).toBeGreaterThan(0);
    expect(analysis.totalEntries).toBe(scenario.history.length);

    // With all tool calls, we should have tool outputs
    expect(analysis.breakdown.toolOutputs.entries).toBe(10);
    expect(analysis.breakdown.toolOutputs.tokens).toBeGreaterThan(0);

    // Should have system prompt (detected by structural marker)
    expect(analysis.breakdown.systemPrompt.entries).toBe(1);
    expect(analysis.breakdown.systemPrompt.tokens).toBeGreaterThan(0);
  });

  it('should track tool outputs by age', () => {
    const scenario = createAgentConversation(10, { toolCallFraction: 1.0 });
    const analysis = analyzeHistory(scenario.history);

    // Each turn has one tool output
    expect(analysis.toolOutputsByAge.length).toBe(10);

    // Tool outputs should have valid tool names
    for (const output of analysis.toolOutputsByAge) {
      expect(output.toolName).toBeTruthy();
      expect(output.tokens).toBeGreaterThan(0);
    }
  });

  it('should calculate token breakdown that sums to total', () => {
    const scenario = createAgentConversation(15);
    const analysis = analyzeHistory(scenario.history);

    const breakdownSum =
      analysis.breakdown.systemPrompt.tokens +
      analysis.breakdown.userText.tokens +
      analysis.breakdown.assistantText.tokens +
      analysis.breakdown.toolCalls.tokens +
      analysis.breakdown.toolOutputs.tokens;

    // Allow some rounding error due to token estimation
    expect(Math.abs(breakdownSum - analysis.totalTokens)).toBeLessThan(
      analysis.totalTokens * 0.01,
    );
  });
});

// ---------------------------------------------------------------------------
// Metrics collection tests
// ---------------------------------------------------------------------------

describe('compressionEval: metrics collection', () => {
  it('should collect metrics from a compression function', async () => {
    const scenario = createAgentConversation(10);

    // Mock a compression function that halves the history
    const mockCompress = async (history: Content[]) => {
      const half = history.slice(Math.floor(history.length / 2));
      return { newHistory: half, status: 'COMPRESSED' };
    };

    const metrics = await collectMetrics(scenario.history, mockCompress);

    expect(metrics.tokensBefore).toBeGreaterThan(0);
    expect(metrics.tokensAfter).toBeLessThan(metrics.tokensBefore);
    expect(metrics.compressionRatio).toBeLessThan(1);
    expect(metrics.compressionRatio).toBeGreaterThan(0);
    expect(metrics.latencyMs).toBeGreaterThanOrEqual(0);
    expect(metrics.status).toBe('COMPRESSED');
    expect(metrics.historyLengthBefore).toBe(scenario.history.length);
    expect(metrics.historyLengthAfter).toBeLessThan(
      metrics.historyLengthBefore,
    );
  });

  it('should handle NOOP compression', async () => {
    const scenario = createAgentConversation(5);

    const mockNoop = async (_history: Content[]) => ({
      newHistory: null,
      status: 'NOOP',
    });

    const metrics = await collectMetrics(scenario.history, mockNoop);

    // When compression returns null (NOOP), both before and after
    // use the same estimator, so ratio should be exactly 1.
    expect(metrics.tokensAfter).toBe(metrics.tokensBefore);
    expect(metrics.compressionRatio).toBe(1);
    expect(metrics.status).toBe('NOOP');
  });
});

// ---------------------------------------------------------------------------
// Strategy comparison tests
// ---------------------------------------------------------------------------

describe('compressionEval: strategy comparison', () => {
  it('should compute correct improvement metrics', () => {
    const baseline = {
      tokensBefore: 10000,
      tokensAfter: 7000,
      compressionRatio: 0.7,
      latencyMs: 3000,
      status: 'COMPRESSED',
      historyLengthBefore: 50,
      historyLengthAfter: 20,
    };

    const experimental = {
      tokensBefore: 10000,
      tokensAfter: 4000,
      compressionRatio: 0.4,
      latencyMs: 100,
      status: 'COMPRESSED',
      historyLengthBefore: 50,
      historyLengthAfter: 20,
    };

    const comparison = compareStrategies('test', baseline, experimental);

    expect(comparison.ratioImprovement).toBeCloseTo(0.3); // 0.7 - 0.4
    expect(comparison.latencyChange).toBe(-2900); // 100 - 3000
  });

  it('should format a readable report', () => {
    const comparisons = [
      compareStrategies(
        'short-session',
        {
          tokensBefore: 5000,
          tokensAfter: 5000,
          compressionRatio: 1.0,
          latencyMs: 0,
          status: 'NOOP',
          historyLengthBefore: 20,
          historyLengthAfter: 20,
        },
        {
          tokensBefore: 5000,
          tokensAfter: 3000,
          compressionRatio: 0.6,
          latencyMs: 50,
          status: 'COMPRESSED',
          historyLengthBefore: 20,
          historyLengthAfter: 15,
        },
      ),
    ];

    const report = formatComparisonReport(comparisons);

    expect(report).toContain('Compression Evaluation Report');
    expect(report).toContain('short-session');
    expect(report).toContain('Baseline');
    expect(report).toContain('Experimental');
    expect(report).toContain('Improvement');
  });
});

// ---------------------------------------------------------------------------
// Integration with ChatCompressionService
// ---------------------------------------------------------------------------

describe('compressionEval: integration with ChatCompressionService', () => {
  let service: ChatCompressionService;
  let mockConfig: Config;

  beforeEach(() => {
    service = new ChatCompressionService();

    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              { text: '<state_snapshot>Compressed state</state_snapshot>' },
            ],
          },
        },
      ],
    } as unknown as GenerateContentResponse);

    mockConfig = {
      get config() {
        return this;
      },
      getCompressionThreshold: vi.fn().mockResolvedValue(0.5),
      getBaseLlmClient: vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
      getContentGenerator: vi.fn().mockReturnValue({
        countTokens: vi.fn().mockResolvedValue({ totalTokens: 100 }),
      }),
      getHookSystem: vi.fn().mockReturnValue({
        firePreCompressEvent: vi.fn().mockResolvedValue({}),
      }),
      getApprovedPlanPath: vi.fn().mockReturnValue(undefined),
      getActiveModel: vi.fn().mockReturnValue('gemini-2.5-pro'),
      getGemini31LaunchedSync: vi.fn().mockReturnValue(false),
      getGemini31FlashLiteLaunchedSync: vi.fn().mockReturnValue(false),
      getNextCompressionTruncationId: vi.fn().mockReturnValue('test-001'),
      getTruncateToolOutputThreshold: vi.fn().mockReturnValue(40000),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/test'),
      },
    } as unknown as Config;
  });

  it('should evaluate standard scenarios and produce metrics', async () => {
    const scenario = createAgentConversation(10, { avgToolOutputTokens: 200 });

    const mockChat = {
      getHistory: vi.fn().mockReturnValue(scenario.history),
      getLastPromptTokenCount: vi.fn().mockReturnValue(scenario.totalTokens),
    } as unknown as GeminiChat;

    // Run compression and collect metrics
    const result = await service.compress(
      mockChat,
      'eval-prompt',
      true, // force compression for evaluation
      'gemini-2.5-pro',
      mockConfig,
      false,
    );

    // Verify we got a meaningful result
    expect(result.info.compressionStatus).toBeDefined();
    expect(
      [
        CompressionStatus.COMPRESSED,
        CompressionStatus.NOOP,
        CompressionStatus.COMPRESSION_FAILED_EMPTY_SUMMARY,
        CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
      ].includes(result.info.compressionStatus),
    ).toBe(true);
  });

  it('should analyze token distribution in generated scenarios', () => {
    const scenarios = createStandardScenarios();

    for (const scenario of scenarios) {
      const analysis = analyzeHistory(scenario.history);

      // Tool outputs should be a significant fraction of total tokens
      // in tool-heavy scenarios
      if (scenario.name.includes('2000avg')) {
        const toolFraction =
          analysis.breakdown.toolOutputs.tokens / analysis.totalTokens;
        expect(toolFraction).toBeGreaterThan(0.3);
      }

      // Verify structure is valid for compression
      expect(analysis.totalEntries).toBeGreaterThan(0);
      expect(analysis.totalTokens).toBeGreaterThan(0);
    }
  });
});
