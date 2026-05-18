/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { diag, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Tracer } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GEN_AI_AGENT_DESCRIPTION,
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GeminiCliOperation,
  SERVICE_DESCRIPTION,
  SERVICE_NAME,
} from './constants.js';
import {
  runInDevTraceSpan,
  spanRegistry,
  truncateForTelemetry,
} from './trace.js';

vi.mock('@opentelemetry/api', async (importOriginal) => {
  const original = await importOriginal();
  return Object.assign({}, original, {
    trace: {
      getTracer: vi.fn(),
    },
    diag: {
      error: vi.fn(),
    },
  });
});

vi.mock('../utils/session.js', () => ({
  sessionId: 'test-session-id',
}));

describe('truncateForTelemetry', () => {
  it('should return string unchanged if within maxLength', () => {
    expect(truncateForTelemetry('hello', 10)).toBe('hello');
  });

  it('should truncate string if exceeding maxLength', () => {
    const result = truncateForTelemetry('hello world', 5);
    expect(result).toBe('hello...[TRUNCATED: original length 11]');
  });

  it('should correctly truncate strings with multi-byte unicode characters (emojis)', () => {
    // 5 emojis, each is multiple bytes in UTF-16
    const emojis = '👋🌍🚀🔥🎉';

    // Truncating to length 5 (which is 2.5 emojis in UTF-16 length terms)
    // truncateString will stop after the full grapheme clusters that fit within 5
    const result = truncateForTelemetry(emojis, 5);

    expect(result).toBe('👋🌍...[TRUNCATED: original length 10]');
  });

  it('should stringify and truncate objects if exceeding maxLength', () => {
    const obj = { message: 'hello world', nested: { a: 1 } };
    const stringified = JSON.stringify(obj);
    const result = truncateForTelemetry(obj, 10);
    expect(result).toBe(
      stringified.substring(0, 10) +
        `...[TRUNCATED: original length ${stringified.length}]`,
    );
  });

  it('should stringify objects unchanged if within maxLength', () => {
    const obj = { a: 1 };
    expect(truncateForTelemetry(obj, 100)).toBe(JSON.stringify(obj));
  });

  it('should return booleans and numbers unchanged', () => {
    expect(truncateForTelemetry(100)).toBe(100);
    expect(truncateForTelemetry(true)).toBe(true);
    expect(truncateForTelemetry(false)).toBe(false);
  });

  it('should return undefined for unsupported types', () => {
    expect(truncateForTelemetry(undefined)).toBeUndefined();
    expect(truncateForTelemetry(() => {})).toBeUndefined();
    expect(truncateForTelemetry(Symbol('test'))).toBeUndefined();
  });
});

describe('runInDevTraceSpan', () => {
  const mockSpan = {
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  };

  const mockTracer = {
    startActiveSpan: vi.fn((name, options, callback) => callback(mockSpan)),
  } as unknown as Tracer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(trace.getTracer).mockReturnValue(mockTracer);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should start an active span', async () => {
    const fn = vi.fn(async () => 'result');

    const result = await runInDevTraceSpan(
      {
        operation: GeminiCliOperation.LLMCall,
        sessionId: 'test-session-id',
        tracesEnabled: true,
      },
      fn,
    );

    expect(result).toBe('result');
    expect(trace.getTracer).toHaveBeenCalled();
    expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
      GeminiCliOperation.LLMCall,
      {
        attributes: {
          [GEN_AI_CONVERSATION_ID]: 'test-session-id',
        },
      },
      expect.any(Function),
    );
  });

  it('should set default attributes on the span metadata', async () => {
    await runInDevTraceSpan(
      {
        operation: GeminiCliOperation.LLMCall,
        sessionId: 'test-session-id',
        tracesEnabled: true,
      },
      async ({ metadata }) => {
        expect(metadata.attributes[GEN_AI_OPERATION_NAME]).toBe(
          GeminiCliOperation.LLMCall,
        );
        expect(metadata.attributes[GEN_AI_AGENT_NAME]).toBe(SERVICE_NAME);
        expect(metadata.attributes[GEN_AI_AGENT_DESCRIPTION]).toBe(
          SERVICE_DESCRIPTION,
        );
        expect(metadata.attributes[GEN_AI_CONVERSATION_ID]).toBe(
          'test-session-id',
        );
      },
    );
  });

  it('should set span attributes from metadata on completion', async () => {
    await runInDevTraceSpan(
      {
        operation: GeminiCliOperation.LLMCall,
        sessionId: 'test-session-id',
        tracesEnabled: true,
      },
      async ({ metadata }) => {
        metadata.input = { query: 'hello' };
        metadata.output = { response: 'world' };
        metadata.attributes['custom.attr'] = 'value';
      },
    );

    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      GEN_AI_INPUT_MESSAGES,
      JSON.stringify({ query: 'hello' }),
    );
    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      GEN_AI_OUTPUT_MESSAGES,
      JSON.stringify({ response: 'world' }),
    );
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('custom.attr', 'value');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.OK,
    });
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('should handle errors in the wrapped function', async () => {
    const error = new Error('test error');
    await expect(
      runInDevTraceSpan(
        {
          operation: GeminiCliOperation.LLMCall,
          sessionId: 'test-session-id',
          tracesEnabled: true,
        },
        async () => {
          throw error;
        },
      ),
    ).rejects.toThrow(error);

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'test error',
    });
    expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('should auto-wrap async iterators and end span when iterator completes', async () => {
    async function* testStream() {
      yield 1;
      yield 2;
    }

    const resultStream = await runInDevTraceSpan(
      {
        operation: GeminiCliOperation.LLMCall,
        sessionId: 'test-session-id',
        tracesEnabled: true,
      },
      async () => testStream(),
    );

    expect(mockSpan.end).not.toHaveBeenCalled();

    const results = [];
    for await (const val of resultStream) {
      results.push(val);
    }

    expect(results).toEqual([1, 2]);
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('should register async generators with spanRegistry', async () => {
    const spy = vi.spyOn(spanRegistry, 'register');
    async function* testStream() {
      yield 1;
    }

    const resultStream = await runInDevTraceSpan(
      {
        operation: GeminiCliOperation.LLMCall,
        sessionId: 'test-session-id',
        tracesEnabled: true,
      },
      async () => testStream(),
    );

    expect(spy).toHaveBeenCalledWith(resultStream, expect.any(Function));
  });

  it('should be idempotent and call span.end only once', async () => {
    vi.spyOn(spanRegistry, 'register');
    async function* testStream() {
      yield 1;
    }

    const resultStream = await runInDevTraceSpan(
      {
        operation: GeminiCliOperation.LLMCall,
        sessionId: 'test-session-id',
        tracesEnabled: true,
      },
      async () => testStream(),
    );

    // Simulate completion
    for await (const _ of resultStream) {
      // iterate
    }
    expect(mockSpan.end).toHaveBeenCalledTimes(1);

    // Try to end again (simulating registry or double call)
    const endSpanFn = vi.mocked(spanRegistry.register).mock
      .calls[0][1] as () => void;
    endSpanFn();

    expect(mockSpan.end).toHaveBeenCalledTimes(1);
  });

  it('should end span automatically on error in async iterators', async () => {
    const error = new Error('streaming error');
    async function* errorStream() {
      yield 1;
      throw error;
    }

    const resultStream = await runInDevTraceSpan(
      {
        operation: GeminiCliOperation.LLMCall,
        sessionId: 'test-session-id',
        tracesEnabled: true,
      },
      async () => errorStream(),
    );

    await expect(async () => {
      for await (const _ of resultStream) {
        // iterate
      }
    }).rejects.toThrow(error);

    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('should handle exceptions in endSpan gracefully', async () => {
    mockSpan.setAttribute.mockImplementation(() => {
      throw new Error('attribute error');
    });

    await runInDevTraceSpan(
      {
        operation: GeminiCliOperation.LLMCall,
        sessionId: 'test-session-id',
        tracesEnabled: true,
      },
      async ({ metadata }) => {
        metadata.input = 'trigger error';
      },
    );

    expect(diag.error).toHaveBeenCalled();
    expect(mockSpan.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        code: SpanStatusCode.ERROR,
        message: expect.stringContaining('attribute error'),
      }),
    );
    expect(mockSpan.end).toHaveBeenCalled();
  });
});
