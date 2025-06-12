/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logs } from '@opentelemetry/api-logs';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { Config } from '../config/config.js';
import { EVENT_API_RESPONSE, EVENT_USER_PROMPT } from './constants.js';
import {
  logApiResponse,
  logCliConfiguration,
  logUserPrompt,
} from './loggers.js';
import * as metrics from './metrics.js';
import * as sdk from './sdk.js';
import { vi, describe, beforeEach, it, expect } from 'vitest';

vi.mock('@gemini-cli/cli/dist/src/utils/version', () => ({
  getCliVersion: () => 'test-version',
}));

vi.mock('@gemini-cli/cli/dist/src/config/settings', () => ({
  getTheme: () => 'test-theme',
}));

describe('loggers', () => {
  const mockLogger = {
    emit: vi.fn(),
  };

  beforeEach(() => {
    vi.spyOn(sdk, 'isTelemetrySdkInitialized').mockReturnValue(true);
    vi.spyOn(logs, 'getLogger').mockReturnValue(mockLogger);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  describe('logCliConfiguration', () => {
    it('should log the cli configuration', () => {
      const mockConfig = {
        getSessionId: () => 'test-session-id',
        getModel: () => 'test-model',
        getEmbeddingModel: () => 'test-embedding-model',
        getSandbox: () => true,
        getCoreTools: () => ['ls', 'read-file'],
        getApprovalMode: () => 'default',
        getContentGeneratorConfig: () => ({
          model: 'test-model',
          apiKey: 'test-api-key',
          vertexai: true,
          codeAssist: false,
        }),
        getTelemetryLogUserPromptsEnabled: () => true,
        getFileFilteringRespectGitIgnore: () => true,
        getFileFilteringAllowBuildArtifacts: () => false,
        getDebugMode: () => true,
        getMcpServers: () => ({
          'test-server': {
            command: 'test-command',
          },
        }),
        getQuestion: () => 'test-question',
      } as unknown as Config;

      logCliConfiguration(mockConfig);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'CLI configuration loaded.',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': 'gemini_cli.config',
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          model: 'test-model',
          embedding_model: 'test-embedding-model',
          sandbox_enabled: true,
          core_tools_enabled: 'ls,read-file',
          approval_mode: 'default',
          api_key_enabled: true,
          vertex_ai_enabled: true,
          code_assist_enabled: false,
          log_user_prompts_enabled: true,
          file_filtering_respect_git_ignore: true,
          file_filtering_allow_build_artifacts: false,
          debug_mode: true,
          mcp_servers: 'test-server',
        },
      });
    });
  });

  describe('logUserPrompt', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getTelemetryLogUserPromptsEnabled: () => true,
    } as unknown as Config;

    it('should log a user prompt', () => {
      const event = {
        prompt: 'test-prompt',
        prompt_length: 11,
      };

      logUserPrompt(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'User prompt. Length: 11',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': EVENT_USER_PROMPT,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          prompt_length: 11,
          prompt: 'test-prompt',
        },
      });
    });

    it('should not log prompt if disabled', () => {
      const mockConfig = {
        getSessionId: () => 'test-session-id',
        getTelemetryLogUserPromptsEnabled: () => false,
      } as unknown as Config;
      const event = {
        prompt: 'test-prompt',
        prompt_length: 11,
      };

      logUserPrompt(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'User prompt. Length: 11',
        attributes: {
          'session.id': 'test-session-id',
          'event.name': EVENT_USER_PROMPT,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          prompt_length: 11,
        },
      });
    });
  });

  describe('logApiResponse', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
    } as Config;

    const mockMetrics = {
      recordApiResponseMetrics: vi.fn(),
      recordTokenUsageMetrics: vi.fn(),
    };

    beforeEach(() => {
      vi.spyOn(metrics, 'recordApiResponseMetrics').mockImplementation(
        mockMetrics.recordApiResponseMetrics,
      );
      vi.spyOn(metrics, 'recordTokenUsageMetrics').mockImplementation(
        mockMetrics.recordTokenUsageMetrics,
      );
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
});
