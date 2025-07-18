/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import {
  EVENT_API_ERROR,
  EVENT_API_RESPONSE,
  EVENT_TOOL_CALL,
} from './constants.js';

import {
  ApiErrorEvent,
  ApiResponseEvent,
  ToolCallEvent,
  ToolCallDecision,
} from './types.js';

export type UiEvent =
  | (ApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE })
  | (ApiErrorEvent & { 'event.name': typeof EVENT_API_ERROR })
  | (ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL });

export interface ToolCallStats {
  count: number;
  success: number;
  fail: number;
  durationMs: number;
  decisions: {
    [ToolCallDecision.ACCEPT]: number;
    [ToolCallDecision.REJECT]: number;
    [ToolCallDecision.MODIFY]: number;
  };
}

export interface ModelMetrics {
  api: {
    totalRequests: number;
    totalErrors: number;
    totalLatencyMs: number;
  };
  tokens: {
    prompt: number;
    candidates: number;
    total: number;
    cached: number;
    thoughts: number;
    tool: number;
  };
}

export interface SessionMetrics {
  models: Record<string, ModelMetrics>;
  tools: {
    totalCalls: number;
    totalSuccess: number;
    totalFail: number;
    totalDurationMs: number;
    totalDecisions: {
      [ToolCallDecision.ACCEPT]: number;
      [ToolCallDecision.REJECT]: number;
      [ToolCallDecision.MODIFY]: number;
    };
    byName: Record<string, ToolCallStats>;
  };
}

const createInitialModelMetrics = (): ModelMetrics => ({
  api: {
    totalRequests: 0,
    totalErrors: 0,
    totalLatencyMs: 0,
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

const createInitialMetrics = (): SessionMetrics => ({
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
    },
    byName: {},
  },
});

export class UiTelemetryService extends EventEmitter {
  #metrics: SessionMetrics = createInitialMetrics();
  #lastPromptTokenCount = 0;

  addEvent(event: UiEvent) {
    switch (event['event.name']) {
      case EVENT_API_RESPONSE:
        this.processApiResponse(event);
        break;
      case EVENT_API_ERROR:
        this.processApiError(event);
        break;
      case EVENT_TOOL_CALL:
        this.processToolCall(event);
        break;
      default:
        // We should not emit update for any other event metric.
        return;
    }

    this.emit('update', {
      metrics: this.#metrics,
      lastPromptTokenCount: this.#lastPromptTokenCount,
    });
  }

  getMetrics(): SessionMetrics {
    return this.#metrics;
  }

  getLastPromptTokenCount(): number {
    return this.#lastPromptTokenCount;
  }

  resetLastPromptTokenCount(): void {
    this.#lastPromptTokenCount = 0;
    this.emit('update', {
      metrics: this.#metrics,
      lastPromptTokenCount: this.#lastPromptTokenCount,
    });
  }

  private getOrCreateModelMetrics(modelName: string): ModelMetrics {
    if (!this.#metrics.models[modelName]) {
      this.#metrics.models[modelName] = createInitialModelMetrics();
    }
    return this.#metrics.models[modelName];
  }

  private processApiResponse(event: ApiResponseEvent) {
    const modelMetrics = this.getOrCreateModelMetrics(event.model);

    modelMetrics.api.totalRequests++;
    modelMetrics.api.totalLatencyMs += event.duration_ms;

    modelMetrics.tokens.prompt += event.input_token_count;
    modelMetrics.tokens.candidates += event.output_token_count;
    modelMetrics.tokens.total += event.total_token_count;
    modelMetrics.tokens.cached += event.cached_content_token_count;
    modelMetrics.tokens.thoughts += event.thoughts_token_count;
    modelMetrics.tokens.tool += event.tool_token_count;

    this.#lastPromptTokenCount = event.input_token_count;
  }

  private processApiError(event: ApiErrorEvent) {
    const modelMetrics = this.getOrCreateModelMetrics(event.model);
    modelMetrics.api.totalRequests++;
    modelMetrics.api.totalErrors++;
    modelMetrics.api.totalLatencyMs += event.duration_ms;
  }

  private processToolCall(event: ToolCallEvent) {
    const { tools } = this.#metrics;
    tools.totalCalls++;
    tools.totalDurationMs += event.duration_ms;

    if (event.success) {
      tools.totalSuccess++;
    } else {
      tools.totalFail++;
    }

    if (!tools.byName[event.function_name]) {
      tools.byName[event.function_name] = {
        count: 0,
        success: 0,
        fail: 0,
        durationMs: 0,
        decisions: {
          [ToolCallDecision.ACCEPT]: 0,
          [ToolCallDecision.REJECT]: 0,
          [ToolCallDecision.MODIFY]: 0,
        },
      };
    }

    const toolStats = tools.byName[event.function_name];
    toolStats.count++;
    toolStats.durationMs += event.duration_ms;
    if (event.success) {
      toolStats.success++;
    } else {
      toolStats.fail++;
    }

    if (event.decision) {
      tools.totalDecisions[event.decision]++;
      toolStats.decisions[event.decision]++;
    }
  }
}

export const uiTelemetryService = new UiTelemetryService();
