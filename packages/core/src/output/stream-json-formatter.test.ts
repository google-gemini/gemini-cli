/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamJsonFormatter } from './stream-json-formatter.js';
import { JsonStreamEventType } from './types.js';
import type {
  InitEvent,
  MessageEvent,
  ToolUseEvent,
  ToolResultEvent,
  ErrorEvent,
  ResultEvent,
} from './types.js';
import type { SessionMetrics } from '../telemetry/uiTelemetry.js';
import { ToolCallDecision } from '../telemetry/tool-call-decision.js';

describe('StreamJsonFormatter', () => {
  let formatter: StreamJsonFormatter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutWriteSpy: any;

  beforeEach(() => {
    formatter = new StreamJsonFormatter();
    stdoutWriteSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
  });

  describe('formatEvent', () => {
    it('should format init event as JSONL', () => {
      const event: InitEvent = {
        type: JsonStreamEventType.INIT,
        timestamp: '2025-10-10T12:00:00.000Z',
        session_id: 'test-session-123',
        model: 'gemini-2.0-flash-exp',
      };

      const result = formatter.formatEvent(event);

      expect(result).toBe(JSON.stringify(event) + '\n');
      expect(JSON.parse(result.trim())).toEqual(event);
    });

    it('should format user message event', () => {
      const event: MessageEvent = {
        type: JsonStreamEventType.MESSAGE,
        timestamp: '2025-10-10T12:00:00.000Z',
        role: 'user',
        content: 'What is 2+2?',
      };

      const result = formatter.formatEvent(event);

      expect(result).toBe(JSON.stringify(event) + '\n');
      expect(JSON.parse(result.trim())).toEqual(event);
    });

    it('should format assistant message event with delta', () => {
      const event: MessageEvent = {
        type: JsonStreamEventType.MESSAGE,
        timestamp: '2025-10-10T12:00:00.000Z',
        role: 'assistant',
        content: '4',
        delta: true,
      };

      const result = formatter.formatEvent(event);

      expect(result).toBe(JSON.stringify(event) + '\n');
      const parsed = JSON.parse(result.trim());
      expect(parsed.delta).toBe(true);
    });

    it('should format tool_use event', () => {
      const event: ToolUseEvent = {
        type: JsonStreamEventType.TOOL_USE,
        timestamp: '2025-10-10T12:00:00.000Z',
        tool_name: 'Read',
        tool_id: 'read-123',
        parameters: { file_path: '/path/to/file.txt' },
      };

      const result = formatter.formatEvent(event);

      expect(result).toBe(JSON.stringify(event) + '\n');
      expect(JSON.parse(result.trim())).toEqual(event);
    });

    it('should format tool_result event (success)', () => {
      const event: ToolResultEvent = {
        type: JsonStreamEventType.TOOL_RESULT,
        timestamp: '2025-10-10T12:00:00.000Z',
        tool_id: 'read-123',
        status: 'success',
        output: 'File contents here',
      };

      const result = formatter.formatEvent(event);

      expect(result).toBe(JSON.stringify(event) + '\n');
      expect(JSON.parse(result.trim())).toEqual(event);
    });

    it('should format tool_result event (error)', () => {
      const event: ToolResultEvent = {
        type: JsonStreamEventType.TOOL_RESULT,
        timestamp: '2025-10-10T12:00:00.000Z',
        tool_id: 'read-123',
        status: 'error',
        error: {
          type: 'FILE_NOT_FOUND',
          message: 'File not found',
        },
      };

      const result = formatter.formatEvent(event);

      expect(result).toBe(JSON.stringify(event) + '\n');
      expect(JSON.parse(result.trim())).toEqual(event);
    });

    it('should format error event', () => {
      const event: ErrorEvent = {
        type: JsonStreamEventType.ERROR,
        timestamp: '2025-10-10T12:00:00.000Z',
        severity: 'warning',
        message: 'Loop detected, stopping execution',
      };

      const result = formatter.formatEvent(event);

      expect(result).toBe(JSON.stringify(event) + '\n');
      expect(JSON.parse(result.trim())).toEqual(event);
    });

    it('should format result event with success status', () => {
      const event: ResultEvent = {
        type: JsonStreamEventType.RESULT,
        timestamp: '2025-10-10T12:00:00.000Z',
        status: 'success',
        stats: {
          total_tokens: 100,
          input_tokens: 50,
          output_tokens: 50,
          duration_ms: 1200,
          tool_calls: 2,
        },
      };

      const result = formatter.formatEvent(event);

      expect(result).toBe(JSON.stringify(event) + '\n');
      expect(JSON.parse(result.trim())).toEqual(event);
    });

    it('should format result event with error status', () => {
      const event: ResultEvent = {
        type: JsonStreamEventType.RESULT,
        timestamp: '2025-10-10T12:00:00.000Z',
        status: 'error',
        error: {
          type: 'MaxSessionTurnsError',
          message: 'Maximum session turns exceeded',
        },
        stats: {
          total_tokens: 100,
          input_tokens: 50,
          output_tokens: 50,
          duration_ms: 1200,
          tool_calls: 0,
        },
      };

      const result = formatter.formatEvent(event);

      expect(result).toBe(JSON.stringify(event) + '\n');
      expect(JSON.parse(result.trim())).toEqual(event);
    });

    it('should produce minified JSON without pretty-printing', () => {
      const event: MessageEvent = {
        type: JsonStreamEventType.MESSAGE,
        timestamp: '2025-10-10T12:00:00.000Z',
        role: 'user',
        content: 'Test',
      };

      const result = formatter.formatEvent(event);

      // Should not contain multiple spaces or newlines (except trailing)
      expect(result).not.toContain('  ');
      expect(result.split('\n').length).toBe(2); // JSON + trailing newline
    });
  });

  describe('emitEvent', () => {
    it('should write formatted event to stdout', () => {
      const event: InitEvent = {
        type: JsonStreamEventType.INIT,
        timestamp: '2025-10-10T12:00:00.000Z',
        session_id: 'test-session',
        model: 'gemini-2.0-flash-exp',
      };

      formatter.emitEvent(event);

      expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);
      expect(stdoutWriteSpy).toHaveBeenCalledWith(JSON.stringify(event) + '\n');
    });

    it('should emit multiple events sequentially', () => {
      const event1: InitEvent = {
        type: JsonStreamEventType.INIT,
        timestamp: '2025-10-10T12:00:00.000Z',
        session_id: 'test-session',
        model: 'gemini-2.0-flash-exp',
      };

      const event2: MessageEvent = {
        type: JsonStreamEventType.MESSAGE,
        timestamp: '2025-10-10T12:00:01.000Z',
        role: 'user',
        content: 'Hello',
      };

      formatter.emitEvent(event1);
      formatter.emitEvent(event2);

      expect(stdoutWriteSpy).toHaveBeenCalledTimes(2);
      expect(stdoutWriteSpy).toHaveBeenNthCalledWith(
        1,
        JSON.stringify(event1) + '\n',
      );
      expect(stdoutWriteSpy).toHaveBeenNthCalledWith(
        2,
        JSON.stringify(event2) + '\n',
      );
    });
  });

  describe('convertToStreamStats', () => {
    it('should aggregate token counts from single model', () => {
      const metrics: SessionMetrics = {
        models: {
          'gemini-2.0-flash': {
            api: {
              totalRequests: 1,
              totalErrors: 0,
              totalLatencyMs: 1000,
            },
            tokens: {
              prompt: 50,
              candidates: 30,
              total: 80,
              cached: 0,
              thoughts: 0,
              tool: 0,
            },
          },
        },
        tools: {
          totalCalls: 2,
          totalSuccess: 2,
          totalFail: 0,
          totalDurationMs: 500,
          totalDecisions: {
            [ToolCallDecision.ACCEPT]: 0,
            [ToolCallDecision.REJECT]: 0,
            [ToolCallDecision.MODIFY]: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 2,
          },
          byName: {},
        },
        files: {
          totalLinesAdded: 0,
          totalLinesRemoved: 0,
        },
      };

      const result = formatter.convertToStreamStats(metrics, 1200);

      expect(result).toEqual({
        total_tokens: 80,
        input_tokens: 50,
        output_tokens: 30,
        duration_ms: 1200,
        tool_calls: 2,
      });
    });

    it('should aggregate token counts from multiple models', () => {
      const metrics: SessionMetrics = {
        models: {
          'gemini-2.0-flash': {
            api: {
              totalRequests: 1,
              totalErrors: 0,
              totalLatencyMs: 1000,
            },
            tokens: {
              prompt: 50,
              candidates: 30,
              total: 80,
              cached: 0,
              thoughts: 0,
              tool: 0,
            },
          },
          'gemini-1.5-pro': {
            api: {
              totalRequests: 1,
              totalErrors: 0,
              totalLatencyMs: 2000,
            },
            tokens: {
              prompt: 100,
              candidates: 70,
              total: 170,
              cached: 0,
              thoughts: 0,
              tool: 0,
            },
          },
        },
        tools: {
          totalCalls: 5,
          totalSuccess: 5,
          totalFail: 0,
          totalDurationMs: 1000,
          totalDecisions: {
            [ToolCallDecision.ACCEPT]: 0,
            [ToolCallDecision.REJECT]: 0,
            [ToolCallDecision.MODIFY]: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 5,
          },
          byName: {},
        },
        files: {
          totalLinesAdded: 0,
          totalLinesRemoved: 0,
        },
      };

      const result = formatter.convertToStreamStats(metrics, 3000);

      expect(result).toEqual({
        total_tokens: 250, // 80 + 170
        input_tokens: 150, // 50 + 100
        output_tokens: 100, // 30 + 70
        duration_ms: 3000,
        tool_calls: 5,
      });
    });

    it('should handle empty metrics', () => {
      const metrics: SessionMetrics = {
        models: {},
        tools: {
          totalCalls: 0,
          totalSuccess: 0,
          totalFail: 0,
          totalDurationMs: 0,
          totalDecisions: {
            [ToolCallDecision.ACCEPT]: 0,
            [ToolCallDecision.REJECT]: 0,
            [ToolCallDecision.MODIFY]: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
          },
          byName: {},
        },
        files: {
          totalLinesAdded: 0,
          totalLinesRemoved: 0,
        },
      };

      const result = formatter.convertToStreamStats(metrics, 100);

      expect(result).toEqual({
        total_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
        duration_ms: 100,
        tool_calls: 0,
      });
    });

    it('should use session-level tool calls count', () => {
      const metrics: SessionMetrics = {
        models: {},
        tools: {
          totalCalls: 3,
          totalSuccess: 2,
          totalFail: 1,
          totalDurationMs: 500,
          totalDecisions: {
            [ToolCallDecision.ACCEPT]: 0,
            [ToolCallDecision.REJECT]: 0,
            [ToolCallDecision.MODIFY]: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 3,
          },
          byName: {
            Read: {
              count: 2,
              success: 2,
              fail: 0,
              durationMs: 300,
              decisions: {
                [ToolCallDecision.ACCEPT]: 0,
                [ToolCallDecision.REJECT]: 0,
                [ToolCallDecision.MODIFY]: 0,
                [ToolCallDecision.AUTO_ACCEPT]: 2,
              },
            },
            Glob: {
              count: 1,
              success: 0,
              fail: 1,
              durationMs: 200,
              decisions: {
                [ToolCallDecision.ACCEPT]: 0,
                [ToolCallDecision.REJECT]: 0,
                [ToolCallDecision.MODIFY]: 0,
                [ToolCallDecision.AUTO_ACCEPT]: 1,
              },
            },
          },
        },
        files: {
          totalLinesAdded: 0,
          totalLinesRemoved: 0,
        },
      };

      const result = formatter.convertToStreamStats(metrics, 1000);

      expect(result.tool_calls).toBe(3);
    });

    it('should pass through duration unchanged', () => {
      const metrics: SessionMetrics = {
        models: {},
        tools: {
          totalCalls: 0,
          totalSuccess: 0,
          totalFail: 0,
          totalDurationMs: 0,
          totalDecisions: {
            [ToolCallDecision.ACCEPT]: 0,
            [ToolCallDecision.REJECT]: 0,
            [ToolCallDecision.MODIFY]: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
          },
          byName: {},
        },
        files: {
          totalLinesAdded: 0,
          totalLinesRemoved: 0,
        },
      };

      const result = formatter.convertToStreamStats(metrics, 5000);

      expect(result.duration_ms).toBe(5000);
    });
  });

  describe('JSON validity', () => {
    it('should produce valid JSON for all event types', () => {
      const events = [
        {
          type: JsonStreamEventType.INIT,
          timestamp: '2025-10-10T12:00:00.000Z',
          session_id: 'test',
          model: 'gemini-2.0-flash',
        } as InitEvent,
        {
          type: JsonStreamEventType.MESSAGE,
          timestamp: '2025-10-10T12:00:00.000Z',
          role: 'user',
          content: 'Test',
        } as MessageEvent,
        {
          type: JsonStreamEventType.TOOL_USE,
          timestamp: '2025-10-10T12:00:00.000Z',
          tool_name: 'Read',
          tool_id: 'read-1',
          parameters: {},
        } as ToolUseEvent,
        {
          type: JsonStreamEventType.TOOL_RESULT,
          timestamp: '2025-10-10T12:00:00.000Z',
          tool_id: 'read-1',
          status: 'success',
        } as ToolResultEvent,
        {
          type: JsonStreamEventType.ERROR,
          timestamp: '2025-10-10T12:00:00.000Z',
          severity: 'error',
          message: 'Test error',
        } as ErrorEvent,
        {
          type: JsonStreamEventType.RESULT,
          timestamp: '2025-10-10T12:00:00.000Z',
          status: 'success',
          stats: {
            total_tokens: 0,
            input_tokens: 0,
            output_tokens: 0,
            duration_ms: 0,
            tool_calls: 0,
          },
        } as ResultEvent,
      ];

      events.forEach((event) => {
        const formatted = formatter.formatEvent(event);
        expect(() => JSON.parse(formatted)).not.toThrow();
      });
    });

    it('should preserve field types', () => {
      const event: ResultEvent = {
        type: JsonStreamEventType.RESULT,
        timestamp: '2025-10-10T12:00:00.000Z',
        status: 'success',
        stats: {
          total_tokens: 100,
          input_tokens: 50,
          output_tokens: 50,
          duration_ms: 1200,
          tool_calls: 2,
        },
      };

      const formatted = formatter.formatEvent(event);
      const parsed = JSON.parse(formatted.trim());

      expect(typeof parsed.stats.total_tokens).toBe('number');
      expect(typeof parsed.stats.input_tokens).toBe('number');
      expect(typeof parsed.stats.output_tokens).toBe('number');
      expect(typeof parsed.stats.duration_ms).toBe('number');
      expect(typeof parsed.stats.tool_calls).toBe('number');
    });
  });
});
