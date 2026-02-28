/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trace, SpanStatusCode, diag, type Tracer } from '@opentelemetry/api';
import { runInDevTraceSpan } from './trace.js';
import {
  GeminiCliOperation,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_AGENT_DESCRIPTION,
  GEN_AI_AGENT_NAME,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  SERVICE_DESCRIPTION,
  SERVICE_NAME,
} from './constants.js';

vi.mock('@opentelemetry/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@opentelemetry/api')>();
  return {
    ...original,
    trace: {
      getTracer: vi.fn(),
    },
    diag: {
      error: vi.fn(),
    },
  };
});

vi.mock('../utils/session.js', () => ({
  sessionId: 'test-session-id',
}));

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
      { operation: GeminiCliOperation.LLMCall },
      fn,
    );

    expect(result).toBe('result');
    expect(trace.getTracer).toHaveBeenCalled();
    expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
      GeminiCliOperation.LLMCall,
      {},
      expect.any(Function),
    );
  });

  it('should set default attributes on the span metadata', async () => {
    await runInDevTraceSpan(
      { operation: GeminiCliOperation.LLMCall },
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
      { operation: GeminiCliOperation.LLMCall },
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
      runInDevTraceSpan({ operation: GeminiCliOperation.LLMCall }, async () => {
        throw error;
      }),
    ).rejects.toThrow(error);

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'test error',
    });
    expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('should respect noAutoEnd option', async () => {
    let capturedEndSpan: () => void = () => {};
    const result = await runInDevTraceSpan(
      { operation: GeminiCliOperation.LLMCall, noAutoEnd: true },
      async ({ endSpan }) => {
        capturedEndSpan = endSpan;
        return 'streaming';
      },
    );

    expect(result).toBe('streaming');
    expect(mockSpan.end).not.toHaveBeenCalled();

    capturedEndSpan();
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('should automatically end span on error even if noAutoEnd is true', async () => {
    const error = new Error('streaming error');
    await expect(
      runInDevTraceSpan(
        { operation: GeminiCliOperation.LLMCall, noAutoEnd: true },
        async () => {
          throw error;
        },
      ),
    ).rejects.toThrow(error);

    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('should handle exceptions in endSpan gracefully', async () => {
    mockSpan.setAttribute.mockImplementation(() => {
      throw new Error('attribute error');
    });

    await runInDevTraceSpan(
      { operation: GeminiCliOperation.LLMCall },
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
