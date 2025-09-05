/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UiTelemetryService } from './uiTelemetry.js';
import { ToolCallDecision } from './tool-call-decision.js';
import type { ApiErrorEvent, ApiResponseEvent } from './types.js';
import { ToolCallEvent } from './types.js';
import {
  EVENT_API_ERROR,
  EVENT_API_RESPONSE,
  EVENT_TOOL_CALL,
} from './constants.js';
import type {
  CompletedToolCall,
  ErroredToolCall,
  SuccessfulToolCall,
} from '../core/coreToolScheduler.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { ToolConfirmationOutcome } from '../tools/tools.js';
import { MockTool } from '../test-utils/tools.js';

const createFakeCompletedToolCall = (
  name: string,
  success: boolean,
  duration = 100,
  outcome?: ToolConfirmationOutcome,
  error?: Error,
): CompletedToolCall => {
  const request = {
    callId: `call_${name}_${Date.now()}`,
    name,
    args: { foo: 'bar' },
    isClientInitiated: false,
    prompt_id: 'prompt-id-1',
  };
  const tool = new MockTool(name);

  if (success) {
    return {
      status: 'success',
      request,
      tool,
      invocation: tool.build({ param: 'test' }),
      response: {
        callId: request.callId,
        responseParts: [
          {
            functionResponse: {
              id: request.callId,
              name,
              response: { output: 'Success!' },
            },
          },
        ],
        error: undefined,
        errorType: undefined,
        resultDisplay: 'Success!',
      },
      durationMs: duration,
      outcome,
    } as SuccessfulToolCall;
  } else {
    return {
      status: 'error',
      request,
      tool,
      response: {
        callId: request.callId,
        responseParts: [
          {
            functionResponse: {
              id: request.callId,
              name,
              response: { error: 'Tool failed' },
            },
          },
        ],
        error: error || new Error('Tool failed'),
        errorType: ToolErrorType.UNKNOWN,
        resultDisplay: 'Failure!',
      },
      durationMs: duration,
      outcome,
    } as ErroredToolCall;
  }
};

describe('UiTelemetryService', () => {
  let service: UiTelemetryService;

  beforeEach(() => {
    service = new UiTelemetryService();
  });

  it('should have correct initial metrics', () => {
    const metrics = service.getMetrics();
    expect(metrics).toEqual({
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
    });
    expect(service.getLastPromptTokenCount()).toBe(0);
  });

  it('should emit an update event when an event is added', () => {
    const spy = vi.fn();
    service.on('update', spy);

    const event = {
      'event.name': EVENT_API_RESPONSE,
      model: 'gemini-2.5-pro',
      duration_ms: 500,
      input_token_count: 10,
      output_token_count: 20,
      total_token_count: 30,
      cached_content_token_count: 5,
      thoughts_token_count: 2,
      tool_token_count: 3,
    } as ApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE };

    service.addEvent(event);

    expect(spy).toHaveBeenCalledOnce();
    const { metrics, lastPromptTokenCount } = spy.mock.calls[0][0];
    expect(metrics).toBeDefined();
    expect(lastPromptTokenCount).toBe(10);
  });

  describe('API Response Event Processing', () => {
    it('should process a single ApiResponseEvent', () => {
      const event = {
        'event.name': EVENT_API_RESPONSE,
        model: 'gemini-2.5-pro',
        duration_ms: 500,
        input_token_count: 10,
        output_token_count: 20,
        total_token_count: 30,
        cached_content_token_count: 5,
        thoughts_token_count: 2,
        tool_token_count: 3,
      } as ApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE };

      service.addEvent(event);

      const metrics = service.getMetrics();
      expect(metrics.models['gemini-2.5-pro']).toEqual({
        api: {
          totalRequests: 1,
          totalErrors: 0,
          totalLatencyMs: 500,
        },
        tokens: {
          prompt: 10,
          candidates: 20,
          total: 30,
          cached: 5,
          thoughts: 2,
          tool: 3,
        },
      });
      expect(service.getLastPromptTokenCount()).toBe(10);
    });

    it('should aggregate multiple ApiResponseEvents for the same model', () => {
      const event1 = {
        'event.name': EVENT_API_RESPONSE,
        model: 'gemini-2.5-pro',
        duration_ms: 500,
        input_token_count: 10,
        output_token_count: 20,
        total_token_count: 30,
        cached_content_token_count: 5,
        thoughts_token_count: 2,
        tool_token_count: 3,
      } as ApiResponseEvent & {
        'event.name': typeof EVENT_API_RESPONSE;
      };
      const event2 = {
        'event.name': EVENT_API_RESPONSE,
        model: 'gemini-2.5-pro',
        duration_ms: 600,
        input_token_count: 15,
        output_token_count: 25,
        total_token_count: 40,
        cached_content_token_count: 10,
        thoughts_token_count: 4,
        tool_token_count: 6,
      } as ApiResponseEvent & {
        'event.name': typeof EVENT_API_RESPONSE;
      };

      service.addEvent(event1);
      service.addEvent(event2);

      const metrics = service.getMetrics();
      expect(metrics.models['gemini-2.5-pro']).toEqual({
        api: {
          totalRequests: 2,
          totalErrors: 0,
          totalLatencyMs: 1100,
        },
        tokens: {
          prompt: 25,
          candidates: 45,
          total: 70,
          cached: 15,
          thoughts: 6,
          tool: 9,
        },
      });
      expect(service.getLastPromptTokenCount()).toBe(15);
    });

    it('should handle ApiResponseEvents for different models', () => {
      const event1 = {
        'event.name': EVENT_API_RESPONSE,
        model: 'gemini-2.5-pro',
        duration_ms: 500,
        input_token_count: 10,
        output_token_count: 20,
        total_token_count: 30,
        cached_content_token_count: 5,
        thoughts_token_count: 2,
        tool_token_count: 3,
      } as ApiResponseEvent & {
        'event.name': typeof EVENT_API_RESPONSE;
      };
      const event2 = {
        'event.name': EVENT_API_RESPONSE,
        model: 'gemini-2.5-flash',
        duration_ms: 1000,
        input_token_count: 100,
        output_token_count: 200,
        total_token_count: 300,
        cached_content_token_count: 50,
        thoughts_token_count: 20,
        tool_token_count: 30,
      } as ApiResponseEvent & {
        'event.name': typeof EVENT_API_RESPONSE;
      };

      service.addEvent(event1);
      service.addEvent(event2);

      const metrics = service.getMetrics();
      expect(metrics.models['gemini-2.5-pro']).toBeDefined();
      expect(metrics.models['gemini-2.5-flash']).toBeDefined();
      expect(metrics.models['gemini-2.5-pro'].api.totalRequests).toBe(1);
      expect(metrics.models['gemini-2.5-flash'].api.totalRequests).toBe(1);
      expect(service.getLastPromptTokenCount()).toBe(100);
    });
  });

  describe('API Error Event Processing', () => {
    it('should process a single ApiErrorEvent', () => {
      const event = {
        'event.name': EVENT_API_ERROR,
        model: 'gemini-2.5-pro',
        duration_ms: 300,
        error: 'Something went wrong',
      } as ApiErrorEvent & { 'event.name': typeof EVENT_API_ERROR };

      service.addEvent(event);

      const metrics = service.getMetrics();
      expect(metrics.models['gemini-2.5-pro']).toEqual({
        api: {
          totalRequests: 1,
          totalErrors: 1,
          totalLatencyMs: 300,
        },
        tokens: {
          prompt: 0,
          candidates: 0,
          total: 0,
          cached: 0,
          thoughts: 0,
          tool: 0,
        },
      });
    });

    it('should aggregate ApiErrorEvents and ApiResponseEvents', () => {
      const responseEvent = {
        'event.name': EVENT_API_RESPONSE,
        model: 'gemini-2.5-pro',
        duration_ms: 500,
        input_token_count: 10,
        output_token_count: 20,
        total_token_count: 30,
        cached_content_token_count: 5,
        thoughts_token_count: 2,
        tool_token_count: 3,
      } as ApiResponseEvent & {
        'event.name': typeof EVENT_API_RESPONSE;
      };
      const errorEvent = {
        'event.name': EVENT_API_ERROR,
        model: 'gemini-2.5-pro',
        duration_ms: 300,
        error: 'Something went wrong',
      } as ApiErrorEvent & { 'event.name': typeof EVENT_API_ERROR };

      service.addEvent(responseEvent);
      service.addEvent(errorEvent);

      const metrics = service.getMetrics();
      expect(metrics.models['gemini-2.5-pro']).toEqual({
        api: {
          totalRequests: 2,
          totalErrors: 1,
          totalLatencyMs: 800,
        },
        tokens: {
          prompt: 10,
          candidates: 20,
          total: 30,
          cached: 5,
          thoughts: 2,
          tool: 3,
        },
      });
    });
  });

  describe('Tool Call Event Processing', () => {
    it('should process a single successful ToolCallEvent', () => {
      const toolCall = createFakeCompletedToolCall(
        'test_tool',
        true,
        150,
        ToolConfirmationOutcome.ProceedOnce,
      );
      service.addEvent({
        ...structuredClone(new ToolCallEvent(toolCall)),
        'event.name': EVENT_TOOL_CALL,
      } as ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL });

      const metrics = service.getMetrics();
      const { tools } = metrics;

      expect(tools.totalCalls).toBe(1);
      expect(tools.totalSuccess).toBe(1);
      expect(tools.totalFail).toBe(0);
      expect(tools.totalDurationMs).toBe(150);
      expect(tools.totalDecisions[ToolCallDecision.ACCEPT]).toBe(1);
      expect(tools.byName['test_tool']).toEqual({
        count: 1,
        success: 1,
        fail: 0,
        durationMs: 150,
        decisions: {
          [ToolCallDecision.ACCEPT]: 1,
          [ToolCallDecision.REJECT]: 0,
          [ToolCallDecision.MODIFY]: 0,
          [ToolCallDecision.AUTO_ACCEPT]: 0,
        },
      });
    });

    it('should process a single failed ToolCallEvent', () => {
      const toolCall = createFakeCompletedToolCall(
        'test_tool',
        false,
        200,
        ToolConfirmationOutcome.Cancel,
      );
      service.addEvent({
        ...structuredClone(new ToolCallEvent(toolCall)),
        'event.name': EVENT_TOOL_CALL,
      } as ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL });

      const metrics = service.getMetrics();
      const { tools } = metrics;

      expect(tools.totalCalls).toBe(1);
      expect(tools.totalSuccess).toBe(0);
      expect(tools.totalFail).toBe(1);
      expect(tools.totalDurationMs).toBe(200);
      expect(tools.totalDecisions[ToolCallDecision.REJECT]).toBe(1);
      expect(tools.byName['test_tool']).toEqual({
        count: 1,
        success: 0,
        fail: 1,
        durationMs: 200,
        decisions: {
          [ToolCallDecision.ACCEPT]: 0,
          [ToolCallDecision.REJECT]: 1,
          [ToolCallDecision.MODIFY]: 0,
          [ToolCallDecision.AUTO_ACCEPT]: 0,
        },
      });
    });

    it('should process a ToolCallEvent with modify decision', () => {
      const toolCall = createFakeCompletedToolCall(
        'test_tool',
        true,
        250,
        ToolConfirmationOutcome.ModifyWithEditor,
      );
      service.addEvent({
        ...structuredClone(new ToolCallEvent(toolCall)),
        'event.name': EVENT_TOOL_CALL,
      } as ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL });

      const metrics = service.getMetrics();
      const { tools } = metrics;

      expect(tools.totalDecisions[ToolCallDecision.MODIFY]).toBe(1);
      expect(tools.byName['test_tool'].decisions[ToolCallDecision.MODIFY]).toBe(
        1,
      );
    });

    it('should process a ToolCallEvent without a decision', () => {
      const toolCall = createFakeCompletedToolCall('test_tool', true, 100);
      service.addEvent({
        ...structuredClone(new ToolCallEvent(toolCall)),
        'event.name': EVENT_TOOL_CALL,
      } as ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL });

      const metrics = service.getMetrics();
      const { tools } = metrics;

      expect(tools.totalDecisions).toEqual({
        [ToolCallDecision.ACCEPT]: 0,
        [ToolCallDecision.REJECT]: 0,
        [ToolCallDecision.MODIFY]: 0,
        [ToolCallDecision.AUTO_ACCEPT]: 0,
      });
      expect(tools.byName['test_tool'].decisions).toEqual({
        [ToolCallDecision.ACCEPT]: 0,
        [ToolCallDecision.REJECT]: 0,
        [ToolCallDecision.MODIFY]: 0,
        [ToolCallDecision.AUTO_ACCEPT]: 0,
      });
    });

    it('should aggregate multiple ToolCallEvents for the same tool', () => {
      const toolCall1 = createFakeCompletedToolCall(
        'test_tool',
        true,
        100,
        ToolConfirmationOutcome.ProceedOnce,
      );
      const toolCall2 = createFakeCompletedToolCall(
        'test_tool',
        false,
        150,
        ToolConfirmationOutcome.Cancel,
      );

      service.addEvent({
        ...structuredClone(new ToolCallEvent(toolCall1)),
        'event.name': EVENT_TOOL_CALL,
      } as ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL });
      service.addEvent({
        ...structuredClone(new ToolCallEvent(toolCall2)),
        'event.name': EVENT_TOOL_CALL,
      } as ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL });

      const metrics = service.getMetrics();
      const { tools } = metrics;

      expect(tools.totalCalls).toBe(2);
      expect(tools.totalSuccess).toBe(1);
      expect(tools.totalFail).toBe(1);
      expect(tools.totalDurationMs).toBe(250);
      expect(tools.totalDecisions[ToolCallDecision.ACCEPT]).toBe(1);
      expect(tools.totalDecisions[ToolCallDecision.REJECT]).toBe(1);
      expect(tools.byName['test_tool']).toEqual({
        count: 2,
        success: 1,
        fail: 1,
        durationMs: 250,
        decisions: {
          [ToolCallDecision.ACCEPT]: 1,
          [ToolCallDecision.REJECT]: 1,
          [ToolCallDecision.MODIFY]: 0,
          [ToolCallDecision.AUTO_ACCEPT]: 0,
        },
      });
    });

    it('should handle ToolCallEvents for different tools', () => {
      const toolCall1 = createFakeCompletedToolCall('tool_A', true, 100);
      const toolCall2 = createFakeCompletedToolCall('tool_B', false, 200);
      service.addEvent({
        ...structuredClone(new ToolCallEvent(toolCall1)),
        'event.name': EVENT_TOOL_CALL,
      } as ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL });
      service.addEvent({
        ...structuredClone(new ToolCallEvent(toolCall2)),
        'event.name': EVENT_TOOL_CALL,
      } as ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL });

      const metrics = service.getMetrics();
      const { tools } = metrics;

      expect(tools.totalCalls).toBe(2);
      expect(tools.totalSuccess).toBe(1);
      expect(tools.totalFail).toBe(1);
      expect(tools.byName['tool_A']).toBeDefined();
      expect(tools.byName['tool_B']).toBeDefined();
      expect(tools.byName['tool_A'].count).toBe(1);
      expect(tools.byName['tool_B'].count).toBe(1);
    });
  });

  describe('resetLastPromptTokenCount', () => {
    it('should reset the last prompt token count to 0', () => {
      // First, set up some initial token count
      const event = {
        'event.name': EVENT_API_RESPONSE,
        model: 'gemini-2.5-pro',
        duration_ms: 500,
        input_token_count: 100,
        output_token_count: 200,
        total_token_count: 300,
        cached_content_token_count: 50,
        thoughts_token_count: 20,
        tool_token_count: 30,
      } as ApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE };

      service.addEvent(event);
      expect(service.getLastPromptTokenCount()).toBe(100);

      // Now reset the token count
      service.resetLastPromptTokenCount();
      expect(service.getLastPromptTokenCount()).toBe(0);
    });

    it('should emit an update event when resetLastPromptTokenCount is called', () => {
      const spy = vi.fn();
      service.on('update', spy);

      // Set up initial token count
      const event = {
        'event.name': EVENT_API_RESPONSE,
        model: 'gemini-2.5-pro',
        duration_ms: 500,
        input_token_count: 100,
        output_token_count: 200,
        total_token_count: 300,
        cached_content_token_count: 50,
        thoughts_token_count: 20,
        tool_token_count: 30,
      } as ApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE };

      service.addEvent(event);
      spy.mockClear(); // Clear the spy to focus on the reset call

      service.resetLastPromptTokenCount();

      expect(spy).toHaveBeenCalledOnce();
      const { metrics, lastPromptTokenCount } = spy.mock.calls[0][0];
      expect(metrics).toBeDefined();
      expect(lastPromptTokenCount).toBe(0);
    });

    it('should not affect other metrics when resetLastPromptTokenCount is called', () => {
      // Set up initial state with some metrics
      const event = {
        'event.name': EVENT_API_RESPONSE,
        model: 'gemini-2.5-pro',
        duration_ms: 500,
        input_token_count: 100,
        output_token_count: 200,
        total_token_count: 300,
        cached_content_token_count: 50,
        thoughts_token_count: 20,
        tool_token_count: 30,
      } as ApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE };

      service.addEvent(event);

      const metricsBefore = service.getMetrics();

      service.resetLastPromptTokenCount();

      const metricsAfter = service.getMetrics();

      // Metrics should be unchanged
      expect(metricsAfter).toEqual(metricsBefore);

      // Only the last prompt token count should be reset
      expect(service.getLastPromptTokenCount()).toBe(0);
    });

    it('should work correctly when called multiple times', () => {
      const spy = vi.fn();
      service.on('update', spy);

      // Set up initial token count
      const event = {
        'event.name': EVENT_API_RESPONSE,
        model: 'gemini-2.5-pro',
        duration_ms: 500,
        input_token_count: 100,
        output_token_count: 200,
        total_token_count: 300,
        cached_content_token_count: 50,
        thoughts_token_count: 20,
        tool_token_count: 30,
      } as ApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE };

      service.addEvent(event);
      expect(service.getLastPromptTokenCount()).toBe(100);

      // Reset once
      service.resetLastPromptTokenCount();
      expect(service.getLastPromptTokenCount()).toBe(0);

      // Reset again - should still be 0 and still emit event
      spy.mockClear();
      service.resetLastPromptTokenCount();
      expect(service.getLastPromptTokenCount()).toBe(0);
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  describe('Tool Call Event with Line Count Metadata', () => {
    it('should aggregate valid line count metadata', () => {
      const toolCall = createFakeCompletedToolCall('test_tool', true, 100);
      const event = {
        ...structuredClone(new ToolCallEvent(toolCall)),
        'event.name': EVENT_TOOL_CALL,
        metadata: {
          model_added_lines: 10,
          model_removed_lines: 5,
        },
      } as ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL };

      service.addEvent(event);

      const metrics = service.getMetrics();
      expect(metrics.files.totalLinesAdded).toBe(10);
      expect(metrics.files.totalLinesRemoved).toBe(5);
    });

    it('should ignore null/undefined values in line count metadata', () => {
      const toolCall = createFakeCompletedToolCall('test_tool', true, 100);
      const event = {
        ...structuredClone(new ToolCallEvent(toolCall)),
        'event.name': EVENT_TOOL_CALL,
        metadata: {
          model_added_lines: null,
          model_removed_lines: undefined,
        },
      } as ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL };

      service.addEvent(event);

      const metrics = service.getMetrics();
      expect(metrics.files.totalLinesAdded).toBe(0);
      expect(metrics.files.totalLinesRemoved).toBe(0);
    });
  });
});
