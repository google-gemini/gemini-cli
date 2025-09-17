/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test to verify circular reference handling in telemetry logging
 */

import { describe, it, expect } from 'vitest';
import { logToolCall } from './loggers.js';
import { ToolCallEvent } from './types.js';
import type { Config } from '../config/config.js';
import type { CompletedToolCall } from '../core/coreToolScheduler.js';
import type {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
} from '../core/turn.js';
import { MockTool } from '../test-utils/tools.js';

describe('Circular Reference Handling', () => {
  it('should handle circular references in tool function arguments', () => {
    // Create a mock config
    const mockConfig = {
      getTelemetryEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
      getSessionId: () => 'test-session',
      getModel: () => 'test-model',
      getEmbeddingModel: () => 'test-embedding',
      getDebugMode: () => false,
    } as unknown as Config;

    // Create an object with circular references (similar to HttpsProxyAgent)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const circularObject: any = {
      sockets: {},
      agent: null,
    };
    circularObject.agent = circularObject; // Create circular reference
    circularObject.sockets['test-host'] = [
      { _httpMessage: { agent: circularObject } },
    ];

    // Create a mock CompletedToolCall with circular references in function_args
    const mockRequest: ToolCallRequestInfo = {
      callId: 'test-call-id',
      name: 'ReadFile',
      args: circularObject, // This would cause the original error
      isClientInitiated: false,
      prompt_id: 'test-prompt-id',
    };

    const mockResponse: ToolCallResponseInfo = {
      callId: 'test-call-id',
      responseParts: [{ text: 'test result' }],
      resultDisplay: undefined,
      error: undefined, // undefined means success
      errorType: undefined,
    };

    const tool = new MockTool('mock-tool');
    const mockCompletedToolCall: CompletedToolCall = {
      status: 'success',
      request: mockRequest,
      response: mockResponse,
      tool,
      invocation: tool.build({}),
      durationMs: 100,
    };

    // Create a tool call event with circular references in function_args
    const event = new ToolCallEvent(mockCompletedToolCall);

    // This should not throw an error
    expect(() => {
      logToolCall(mockConfig, event);
    }).not.toThrow();
  });

  it('should handle normal objects without circular references', () => {
    const mockConfig = {
      getTelemetryEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
      getSessionId: () => 'test-session',
      getModel: () => 'test-model',
      getEmbeddingModel: () => 'test-embedding',
      getDebugMode: () => false,
    } as unknown as Config;

    const normalObject = {
      filePath: '/test/path',
      options: { encoding: 'utf8' },
    };

    const mockRequest: ToolCallRequestInfo = {
      callId: 'test-call-id',
      name: 'ReadFile',
      args: normalObject,
      isClientInitiated: false,
      prompt_id: 'test-prompt-id',
    };

    const mockResponse: ToolCallResponseInfo = {
      callId: 'test-call-id',
      responseParts: [{ text: 'test result' }],
      resultDisplay: undefined,
      error: undefined, // undefined means success
      errorType: undefined,
    };

    const tool = new MockTool('mock-tool');
    const mockCompletedToolCall: CompletedToolCall = {
      status: 'success',
      request: mockRequest,
      response: mockResponse,
      tool,
      invocation: tool.build({}),
      durationMs: 100,
    };

    const event = new ToolCallEvent(mockCompletedToolCall);

    expect(() => {
      logToolCall(mockConfig, event);
    }).not.toThrow();
  });
});
