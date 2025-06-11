/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logs } from '@opentelemetry/api-logs';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { Config } from '../config/config.js';
import { EVENT_API_RESPONSE } from './constants.js';
import { logApiResponse } from './loggers.js';
import * as metrics from './metrics.js';
import * as sdk from './sdk.js';
import { vi, describe, beforeEach, it, expect } from 'vitest';

describe('logApiResponse', () => {
  const mockConfig = {
    getSessionId: () => 'test-session-id',
  } as Config;

  const mockLogger = {
    emit: vi.fn(),
  };

  const mockMetrics = {
    recordApiResponseMetrics: vi.fn(),
    recordTokenUsageMetrics: vi.fn(),
  };

  beforeEach(() => {
    vi.spyOn(sdk, 'isTelemetrySdkInitialized').mockReturnValue(true);
    vi.spyOn(logs, 'getLogger').mockReturnValue(mockLogger);
    vi.spyOn(metrics, 'recordApiResponseMetrics').mockImplementation(
      mockMetrics.recordApiResponseMetrics,
    );
    vi.spyOn(metrics, 'recordTokenUsageMetrics').mockImplementation(
      mockMetrics.recordTokenUsageMetrics,
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  it('should log an API response with all fields', () => {
    const event = {
      model: 'test-model',
      status_code: 200,
      duration_ms: 100,
      attempt: 1,
      output_token_count: 50,
      cached_content_token_count: 10,
      thoughts_token_count: 5,
      tool_token_count: 2,
      response_text: 'test-response',
    };

    logApiResponse(mockConfig, event);

    expect(mockLogger.emit).toHaveBeenCalledWith({
      body: 'API response from test-model. Status: 200. Duration: 100ms.',
      attributes: {
        'session.id': 'test-session-id',
        'event.name': EVENT_API_RESPONSE,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
        [SemanticAttributes.HTTP_STATUS_CODE]: 200,
        model: 'test-model',
        status_code: 200,
        duration_ms: 100,
        attempt: 1,
        output_token_count: 50,
        cached_content_token_count: 10,
        thoughts_token_count: 5,
        tool_token_count: 2,
        response_text: 'test-response',
      },
    });

    expect(mockMetrics.recordApiResponseMetrics).toHaveBeenCalledWith(
      mockConfig,
      'test-model',
      100,
      200,
      undefined,
    );

    expect(mockMetrics.recordTokenUsageMetrics).toHaveBeenCalledWith(
      mockConfig,
      'test-model',
      50,
      'output',
    );
  });

  it('should log an API response with an error', () => {
    const event = {
      model: 'test-model',
      duration_ms: 100,
      attempt: 1,
      error: 'test-error',
      output_token_count: 50,
      cached_content_token_count: 10,
      thoughts_token_count: 5,
      tool_token_count: 2,
      response_text: 'test-response',
    };

    logApiResponse(mockConfig, event);

    expect(mockLogger.emit).toHaveBeenCalledWith({
      body: 'API response from test-model. Status: N/A. Duration: 100ms.',
      attributes: {
        'session.id': 'test-session-id',
        ...event,
        'event.name': EVENT_API_RESPONSE,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
        'error.message': 'test-error',
      },
    });
  });
});
