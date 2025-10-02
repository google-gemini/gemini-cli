/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AnyToolInvocation,
  CompletedToolCall,
  ContentGeneratorConfig,
  ErroredToolCall,
} from '../index.js';
import {
  AuthType,
  EditTool,
  GeminiClient,
  ToolConfirmationOutcome,
  ToolErrorType,
  ToolRegistry,
} from '../index.js';
import { OutputFormat } from '../output/types.js';
import { logs } from '@opentelemetry/api-logs';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type { Config } from '../config/config.js';
import {
  EVENT_API_REQUEST,
  EVENT_API_RESPONSE,
  EVENT_CLI_CONFIG,
  EVENT_TOOL_CALL,
  EVENT_USER_PROMPT,
  EVENT_FLASH_FALLBACK,
  EVENT_MALFORMED_JSON_RESPONSE,
  EVENT_FILE_OPERATION,
  EVENT_RIPGREP_FALLBACK,
  EVENT_MODEL_ROUTING,
  EVENT_EXTENSION_ENABLE,
  EVENT_EXTENSION_DISABLE,
  EVENT_EXTENSION_INSTALL,
  EVENT_EXTENSION_UNINSTALL,
  EVENT_TOOL_OUTPUT_TRUNCATED,
} from './constants.js';
import {
  logApiRequest,
  logApiResponse,
  logCliConfiguration,
  logUserPrompt,
  logToolCall,
  logFlashFallback,
  logChatCompression,
  logMalformedJsonResponse,
  logFileOperation,
  logRipgrepFallback,
  logToolOutputTruncated,
  logModelRouting,
  logExtensionEnable,
  logExtensionDisable,
  logExtensionInstallEvent,
  logExtensionUninstall,
} from './loggers.js';
import { ToolCallDecision } from './tool-call-decision.js';
import {
  ApiRequestEvent,
  ApiResponseEvent,
  StartSessionEvent,
  ToolCallEvent,
  UserPromptEvent,
  FlashFallbackEvent,
  RipgrepFallbackEvent,
  MalformedJsonResponseEvent,
  makeChatCompressionEvent,
  FileOperationEvent,
  ToolOutputTruncatedEvent,
  ModelRoutingEvent,
  ExtensionEnableEvent,
  ExtensionDisableEvent,
  ExtensionInstallEvent,
  ExtensionUninstallEvent,
} from './types.js';
import * as metrics from './metrics.js';
import {
  FileOperation,
  GenAiOperationName,
  GenAiProviderName,
} from './metrics.js';
import * as sdk from './sdk.js';
import { vi, describe, beforeEach, it, expect, afterEach } from 'vitest';
import type {
  CallableTool,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import * as uiTelemetry from './uiTelemetry.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { ClearcutLogger } from './clearcut-logger/clearcut-logger.js';
import { UserAccountManager } from '../utils/userAccountManager.js';

describe('loggers', () => {
  const mockLogger = {
    emit: vi.fn(),
  };
  const mockUiEvent = {
    addEvent: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(sdk, 'isTelemetrySdkInitialized').mockReturnValue(true);
    vi.spyOn(logs, 'getLogger').mockReturnValue(mockLogger);
    vi.spyOn(uiTelemetry.uiTelemetryService, 'addEvent').mockImplementation(
      mockUiEvent.addEvent,
    );
    vi.spyOn(
      UserAccountManager.prototype,
      'getCachedGoogleAccount',
    ).mockReturnValue('test-user@example.com');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  describe('logChatCompression', () => {
    beforeEach(() => {
      vi.spyOn(metrics, 'recordChatCompressionMetrics');
      vi.spyOn(ClearcutLogger.prototype, 'logChatCompressionEvent');
    });

    it('logs the chat compression event to Clearcut', () => {
      const mockConfig = makeFakeConfig();

      const event = makeChatCompressionEvent({
        tokens_before: 9001,
        tokens_after: 9000,
      });

      logChatCompression(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logChatCompressionEvent,
      ).toHaveBeenCalledWith(event);
    });

    it('records the chat compression event to OTEL', () => {
      const mockConfig = makeFakeConfig();

      logChatCompression(
        mockConfig,
        makeChatCompressionEvent({
          tokens_before: 9001,
          tokens_after: 9000,
        }),
      );

      expect(metrics.recordChatCompressionMetrics).toHaveBeenCalledWith(
        mockConfig,
        { tokens_before: 9001, tokens_after: 9000 },
      );
    });
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
          authType: AuthType.USE_VERTEX_AI,
        }),
        getTelemetryEnabled: () => true,
        getUsageStatisticsEnabled: () => true,
        getTelemetryLogPromptsEnabled: () => true,
        getFileFilteringRespectGitIgnore: () => true,
        getFileFilteringAllowBuildArtifacts: () => false,
        getDebugMode: () => true,
        getMcpServers: () => ({
          'test-server': {
            command: 'test-command',
          },
        }),
        getQuestion: () => 'test-question',
        getTargetDir: () => 'target-dir',
        getProxy: () => 'http://test.proxy.com:8080',
        getOutputFormat: () => OutputFormat.JSON,
      } as unknown as Config;

      const startSessionEvent = new StartSessionEvent(mockConfig);
      logCliConfiguration(mockConfig, startSessionEvent);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'CLI configuration loaded.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_CLI_CONFIG,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          model: 'test-model',
          embedding_model: 'test-embedding-model',
          sandbox_enabled: true,
          core_tools_enabled: 'ls,read-file',
          approval_mode: 'default',
          api_key_enabled: true,
          vertex_ai_enabled: true,
          log_user_prompts_enabled: true,
          file_filtering_respect_git_ignore: true,
          debug_mode: true,
          mcp_servers: 'test-server',
          mcp_servers_count: 1,
          mcp_tools: undefined,
          mcp_tools_count: undefined,
          output_format: 'json',
        },
      });
    });
  });

  describe('logUserPrompt', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getTelemetryEnabled: () => true,
      getTelemetryLogPromptsEnabled: () => true,
      getUsageStatisticsEnabled: () => true,
    } as unknown as Config;

    it('should log a user prompt', () => {
      const event = new UserPromptEvent(
        11,
        'prompt-id-8',
        AuthType.USE_VERTEX_AI,
        'test-prompt',
      );

      logUserPrompt(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'User prompt. Length: 11.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_USER_PROMPT,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          prompt_length: 11,
          prompt: 'test-prompt',
          prompt_id: 'prompt-id-8',
          auth_type: 'vertex-ai',
        },
      });
    });

    it('should not log prompt if disabled', () => {
      const mockConfig = {
        getSessionId: () => 'test-session-id',
        getTelemetryEnabled: () => true,
        getTelemetryLogPromptsEnabled: () => false,
        getTargetDir: () => 'target-dir',
        getUsageStatisticsEnabled: () => true,
      } as unknown as Config;
      const event = new UserPromptEvent(
        11,
        'prompt-id-9',
        AuthType.CLOUD_SHELL,
        'test-prompt',
      );

      logUserPrompt(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'User prompt. Length: 11.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_USER_PROMPT,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          prompt_length: 11,
          prompt_id: 'prompt-id-9',
          auth_type: 'cloud-shell',
        },
      });
    });
  });

  describe('logApiResponse', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getTargetDir: () => 'target-dir',
      getUsageStatisticsEnabled: () => true,
      getTelemetryEnabled: () => true,
      getTelemetryLogPromptsEnabled: () => true,
    } as Config;

    const mockMetrics = {
      recordApiResponseMetrics: vi.fn(),
      recordTokenUsageMetrics: vi.fn(),
      getConventionAttributes: vi.fn(() => ({
        'gen_ai.operation.name': GenAiOperationName.GENERATE_CONTENT,
        'gen_ai.provider.name': GenAiProviderName.GCP_VERTEX_AI,
        'gen_ai.request.model': 'test-model',
        'gen_ai.response.model': 'test-model',
      })),
    };

    beforeEach(() => {
      vi.spyOn(metrics, 'recordApiResponseMetrics').mockImplementation(
        mockMetrics.recordApiResponseMetrics,
      );
      vi.spyOn(metrics, 'recordTokenUsageMetrics').mockImplementation(
        mockMetrics.recordTokenUsageMetrics,
      );
      vi.spyOn(metrics, 'getConventionAttributes').mockImplementation(
        mockMetrics.getConventionAttributes,
      );
    });

    it('should log an API response with all fields', () => {
      const usageData: GenerateContentResponseUsageMetadata = {
        promptTokenCount: 17,
        candidatesTokenCount: 50,
        cachedContentTokenCount: 10,
        thoughtsTokenCount: 5,
        toolUsePromptTokenCount: 2,
      };
      const event = new ApiResponseEvent(
        'test-model',
        100,
        'prompt-id-1',
        AuthType.LOGIN_WITH_GOOGLE,
        usageData,
        'test-response',
      );

      logApiResponse(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'API response from test-model. Status: 200. Duration: 100ms.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_API_RESPONSE,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          [SemanticAttributes.HTTP_STATUS_CODE]: 200,
          model: 'test-model',
          status_code: 200,
          duration_ms: 100,
          input_token_count: 17,
          output_token_count: 50,
          cached_content_token_count: 10,
          thoughts_token_count: 5,
          tool_token_count: 2,
          total_token_count: 0,
          response_text: 'test-response',
          prompt_id: 'prompt-id-1',
          auth_type: 'oauth-personal',
        },
      });

      expect(mockMetrics.recordApiResponseMetrics).toHaveBeenCalledWith(
        mockConfig,
        100,
        {
          model: 'test-model',
          status_code: 200,
          genAiAttributes: {
            'gen_ai.operation.name': 'generate_content',
            'gen_ai.provider.name': 'gcp.vertex_ai',
            'gen_ai.request.model': 'test-model',
            'gen_ai.response.model': 'test-model',
          },
        },
      );

      // Verify token usage calls for all token types
      expect(mockMetrics.recordTokenUsageMetrics).toHaveBeenCalledWith(
        mockConfig,
        17,
        {
          model: 'test-model',
          type: 'input',
          genAiAttributes: {
            'gen_ai.operation.name': 'generate_content',
            'gen_ai.provider.name': 'gcp.vertex_ai',
            'gen_ai.request.model': 'test-model',
            'gen_ai.response.model': 'test-model',
          },
        },
      );

      expect(mockMetrics.recordTokenUsageMetrics).toHaveBeenCalledWith(
        mockConfig,
        50,
        {
          model: 'test-model',
          type: 'output',
          genAiAttributes: {
            'gen_ai.operation.name': 'generate_content',
            'gen_ai.provider.name': 'gcp.vertex_ai',
            'gen_ai.request.model': 'test-model',
            'gen_ai.response.model': 'test-model',
          },
        },
      );

      expect(mockUiEvent.addEvent).toHaveBeenCalledWith({
        ...event,
        'event.name': EVENT_API_RESPONSE,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
      });
    });
  });

  describe('logApiRequest', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getTargetDir: () => 'target-dir',
      getUsageStatisticsEnabled: () => true,
      getTelemetryEnabled: () => true,
      getTelemetryLogPromptsEnabled: () => true,
    } as Config;

    it('should log an API request with request_text', () => {
      const event = new ApiRequestEvent(
        'test-model',
        'prompt-id-7',
        'This is a test request',
      );

      logApiRequest(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'API request to test-model.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_API_REQUEST,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          model: 'test-model',
          request_text: 'This is a test request',
          prompt_id: 'prompt-id-7',
        },
      });
    });

    it('should log an API request without request_text', () => {
      const event = new ApiRequestEvent('test-model', 'prompt-id-6');

      logApiRequest(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'API request to test-model.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_API_REQUEST,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          model: 'test-model',
          prompt_id: 'prompt-id-6',
        },
      });
    });
  });

  describe('logFlashFallback', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
    } as unknown as Config;

    it('should log flash fallback event', () => {
      const event = new FlashFallbackEvent(AuthType.USE_VERTEX_AI);

      logFlashFallback(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Switching to flash as Fallback.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_FLASH_FALLBACK,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          auth_type: 'vertex-ai',
        },
      });
    });
  });

  describe('logRipgrepFallback', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logRipgrepFallbackEvent');
    });

    it('should log ripgrep fallback event', () => {
      const event = new RipgrepFallbackEvent();

      logRipgrepFallback(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logRipgrepFallbackEvent,
      ).toHaveBeenCalled();

      const emittedEvent = mockLogger.emit.mock.calls[0][0];
      expect(emittedEvent.body).toBe('Switching to grep as fallback.');
      expect(emittedEvent.attributes).toEqual(
        expect.objectContaining({
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_RIPGREP_FALLBACK,
          error: undefined,
        }),
      );
    });

    it('should log ripgrep fallback event with an error', () => {
      const event = new RipgrepFallbackEvent('rg not found');

      logRipgrepFallback(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logRipgrepFallbackEvent,
      ).toHaveBeenCalled();

      const emittedEvent = mockLogger.emit.mock.calls[0][0];
      expect(emittedEvent.body).toBe('Switching to grep as fallback.');
      expect(emittedEvent.attributes).toEqual(
        expect.objectContaining({
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_RIPGREP_FALLBACK,
          error: 'rg not found',
        }),
      );
    });
  });

  describe('logToolCall', () => {
    const cfg1 = {
      getSessionId: () => 'test-session-id',
      getTargetDir: () => 'target-dir',
      getGeminiClient: () => mockGeminiClient,
    } as Config;
    const cfg2 = {
      getSessionId: () => 'test-session-id',
      getTargetDir: () => 'target-dir',
      getProxy: () => 'http://test.proxy.com:8080',
      getContentGeneratorConfig: () =>
        ({ model: 'test-model' }) as ContentGeneratorConfig,
      getModel: () => 'test-model',
      getEmbeddingModel: () => 'test-embedding-model',
      getWorkingDir: () => 'test-working-dir',
      getSandbox: () => true,
      getCoreTools: () => ['ls', 'read-file'],
      getApprovalMode: () => 'default',
      getTelemetryLogPromptsEnabled: () => true,
      getFileFilteringRespectGitIgnore: () => true,
      getFileFilteringAllowBuildArtifacts: () => false,
      getDebugMode: () => true,
      getMcpServers: () => ({
        'test-server': {
          command: 'test-command',
        },
      }),
      getQuestion: () => 'test-question',
      getToolRegistry: () => new ToolRegistry(cfg1),
      getFullContext: () => false,
      getUserMemory: () => 'user-memory',
    } as unknown as Config;

    const mockGeminiClient = new GeminiClient(cfg2);
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getTargetDir: () => 'target-dir',
      getGeminiClient: () => mockGeminiClient,
      getUsageStatisticsEnabled: () => true,
      getTelemetryEnabled: () => true,
      getTelemetryLogPromptsEnabled: () => true,
    } as Config;

    const mockMetrics = {
      recordToolCallMetrics: vi.fn(),
    };

    beforeEach(() => {
      vi.spyOn(metrics, 'recordToolCallMetrics').mockImplementation(
        mockMetrics.recordToolCallMetrics,
      );
      mockLogger.emit.mockReset();
    });

    it('should log a tool call with all fields', () => {
      const tool = new EditTool(mockConfig);
      const call: CompletedToolCall = {
        status: 'success',
        request: {
          name: 'test-function',
          args: {
            arg1: 'value1',
            arg2: 2,
          },
          callId: 'test-call-id',
          isClientInitiated: true,
          prompt_id: 'prompt-id-1',
        },
        response: {
          callId: 'test-call-id',
          responseParts: [{ text: 'test-response' }],
          resultDisplay: {
            fileDiff: 'diff',
            fileName: 'file.txt',
            originalContent: 'old content',
            newContent: 'new content',
            diffStat: {
              model_added_lines: 1,
              model_removed_lines: 2,
              model_added_chars: 3,
              model_removed_chars: 4,
              user_added_lines: 5,
              user_removed_lines: 6,
              user_added_chars: 7,
              user_removed_chars: 8,
            },
          },
          error: undefined,
          errorType: undefined,
          contentLength: 13,
        },
        tool,
        invocation: {} as AnyToolInvocation,
        durationMs: 100,
        outcome: ToolConfirmationOutcome.ProceedOnce,
      };
      const event = new ToolCallEvent(call);

      logToolCall(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Tool call: test-function. Decision: accept. Success: true. Duration: 100ms.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          function_name: 'test-function',
          function_args: JSON.stringify(
            {
              arg1: 'value1',
              arg2: 2,
            },
            null,
            2,
          ),
          duration_ms: 100,
          success: true,
          decision: ToolCallDecision.ACCEPT,
          prompt_id: 'prompt-id-1',
          tool_type: 'native',
          error: undefined,
          error_type: undefined,

          metadata: {
            model_added_lines: 1,
            model_removed_lines: 2,
            model_added_chars: 3,
            model_removed_chars: 4,
            user_added_lines: 5,
            user_removed_lines: 6,
            user_added_chars: 7,
            user_removed_chars: 8,
          },
          content_length: 13,
        },
      });

      expect(mockMetrics.recordToolCallMetrics).toHaveBeenCalledWith(
        mockConfig,
        100,
        {
          function_name: 'test-function',
          success: true,
          decision: ToolCallDecision.ACCEPT,
          tool_type: 'native',
        },
      );

      expect(mockUiEvent.addEvent).toHaveBeenCalledWith({
        ...event,
        'event.name': EVENT_TOOL_CALL,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
      });
    });
    it('should log a tool call with a reject decision', () => {
      const call: ErroredToolCall = {
        status: 'error',
        request: {
          name: 'test-function',
          args: {
            arg1: 'value1',
            arg2: 2,
          },
          callId: 'test-call-id',
          isClientInitiated: true,
          prompt_id: 'prompt-id-2',
        },
        response: {
          callId: 'test-call-id',
          responseParts: [{ text: 'test-response' }],
          resultDisplay: undefined,
          error: undefined,
          errorType: undefined,
          contentLength: undefined,
        },
        durationMs: 100,
        outcome: ToolConfirmationOutcome.Cancel,
      };
      const event = new ToolCallEvent(call);

      logToolCall(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Tool call: test-function. Decision: reject. Success: false. Duration: 100ms.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          function_name: 'test-function',
          function_args: JSON.stringify(
            {
              arg1: 'value1',
              arg2: 2,
            },
            null,
            2,
          ),
          duration_ms: 100,
          success: false,
          decision: ToolCallDecision.REJECT,
          prompt_id: 'prompt-id-2',
          tool_type: 'native',
          error: undefined,
          error_type: undefined,
          metadata: undefined,
          content_length: undefined,
        },
      });

      expect(mockMetrics.recordToolCallMetrics).toHaveBeenCalledWith(
        mockConfig,
        100,
        {
          function_name: 'test-function',
          success: false,
          decision: ToolCallDecision.REJECT,
          tool_type: 'native',
        },
      );

      expect(mockUiEvent.addEvent).toHaveBeenCalledWith({
        ...event,
        'event.name': EVENT_TOOL_CALL,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
      });
    });

    it('should log a tool call with a modify decision', () => {
      const call: CompletedToolCall = {
        status: 'success',
        request: {
          name: 'test-function',
          args: {
            arg1: 'value1',
            arg2: 2,
          },
          callId: 'test-call-id',
          isClientInitiated: true,
          prompt_id: 'prompt-id-3',
        },
        response: {
          callId: 'test-call-id',
          responseParts: [{ text: 'test-response' }],
          resultDisplay: undefined,
          error: undefined,
          errorType: undefined,
          contentLength: 13,
        },
        outcome: ToolConfirmationOutcome.ModifyWithEditor,
        tool: new EditTool(mockConfig),
        invocation: {} as AnyToolInvocation,
        durationMs: 100,
      };
      const event = new ToolCallEvent(call);

      logToolCall(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Tool call: test-function. Decision: modify. Success: true. Duration: 100ms.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          function_name: 'test-function',
          function_args: JSON.stringify(
            {
              arg1: 'value1',
              arg2: 2,
            },
            null,
            2,
          ),
          duration_ms: 100,
          success: true,
          decision: ToolCallDecision.MODIFY,
          prompt_id: 'prompt-id-3',
          tool_type: 'native',
          error: undefined,
          error_type: undefined,
          metadata: undefined,
          content_length: 13,
        },
      });

      expect(mockMetrics.recordToolCallMetrics).toHaveBeenCalledWith(
        mockConfig,
        100,
        {
          function_name: 'test-function',
          success: true,
          decision: ToolCallDecision.MODIFY,
          tool_type: 'native',
        },
      );

      expect(mockUiEvent.addEvent).toHaveBeenCalledWith({
        ...event,
        'event.name': EVENT_TOOL_CALL,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
      });
    });

    it('should log a tool call without a decision', () => {
      const call: CompletedToolCall = {
        status: 'success',
        request: {
          name: 'test-function',
          args: {
            arg1: 'value1',
            arg2: 2,
          },
          callId: 'test-call-id',
          isClientInitiated: true,
          prompt_id: 'prompt-id-4',
        },
        response: {
          callId: 'test-call-id',
          responseParts: [{ text: 'test-response' }],
          resultDisplay: undefined,
          error: undefined,
          errorType: undefined,
          contentLength: 13,
        },
        tool: new EditTool(mockConfig),
        invocation: {} as AnyToolInvocation,
        durationMs: 100,
      };
      const event = new ToolCallEvent(call);

      logToolCall(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Tool call: test-function. Success: true. Duration: 100ms.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          function_name: 'test-function',
          function_args: JSON.stringify(
            {
              arg1: 'value1',
              arg2: 2,
            },
            null,
            2,
          ),
          duration_ms: 100,
          success: true,
          prompt_id: 'prompt-id-4',
          tool_type: 'native',
          decision: undefined,
          error: undefined,
          error_type: undefined,
          metadata: undefined,
          content_length: 13,
        },
      });

      expect(mockMetrics.recordToolCallMetrics).toHaveBeenCalledWith(
        mockConfig,
        100,
        {
          function_name: 'test-function',
          success: true,
          decision: undefined,
          tool_type: 'native',
        },
      );

      expect(mockUiEvent.addEvent).toHaveBeenCalledWith({
        ...event,
        'event.name': EVENT_TOOL_CALL,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
      });
    });

    it('should log a failed tool call with an error', () => {
      const errorMessage = 'test-error';
      const call: ErroredToolCall = {
        status: 'error',
        request: {
          name: 'test-function',
          args: {
            arg1: 'value1',
            arg2: 2,
          },
          callId: 'test-call-id',
          isClientInitiated: true,
          prompt_id: 'prompt-id-5',
        },
        response: {
          callId: 'test-call-id',
          responseParts: [{ text: 'test-response' }],
          resultDisplay: undefined,
          error: new Error(errorMessage),
          errorType: ToolErrorType.UNKNOWN,
          contentLength: errorMessage.length,
        },
        durationMs: 100,
      };
      const event = new ToolCallEvent(call);

      logToolCall(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Tool call: test-function. Success: false. Duration: 100ms.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          function_name: 'test-function',
          function_args: JSON.stringify(
            {
              arg1: 'value1',
              arg2: 2,
            },
            null,
            2,
          ),
          duration_ms: 100,
          success: false,
          error: 'test-error',
          'error.message': 'test-error',
          error_type: ToolErrorType.UNKNOWN,
          'error.type': ToolErrorType.UNKNOWN,
          prompt_id: 'prompt-id-5',
          tool_type: 'native',
          decision: undefined,
          metadata: undefined,
          content_length: errorMessage.length,
        },
      });

      expect(mockMetrics.recordToolCallMetrics).toHaveBeenCalledWith(
        mockConfig,
        100,
        {
          function_name: 'test-function',
          success: false,
          decision: undefined,
          tool_type: 'native',
        },
      );

      expect(mockUiEvent.addEvent).toHaveBeenCalledWith({
        ...event,
        'event.name': EVENT_TOOL_CALL,
        'event.timestamp': '2025-01-01T00:00:00.000Z',
      });
    });

    it('should log a tool call with mcp_server_name for MCP tools', () => {
      const mockMcpTool = new DiscoveredMCPTool(
        {} as CallableTool,
        'mock_mcp_server',
        'mock_mcp_tool',
        'tool description',
        {
          type: 'object',
          properties: {
            arg1: { type: 'string' },
            arg2: { type: 'number' },
          },
          required: ['arg1', 'arg2'],
        },
      );

      const call: CompletedToolCall = {
        status: 'success',
        request: {
          name: 'mock_mcp_tool',
          args: { arg1: 'value1', arg2: 2 },
          callId: 'test-call-id',
          isClientInitiated: true,
          prompt_id: 'prompt-id',
        },
        response: {
          callId: 'test-call-id',
          responseParts: [{ text: 'test-response' }],
          resultDisplay: undefined,
          error: undefined,
          errorType: undefined,
        },
        tool: mockMcpTool,
        invocation: {} as AnyToolInvocation,
        durationMs: 100,
      };
      const event = new ToolCallEvent(call);

      logToolCall(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Tool call: mock_mcp_tool. Success: true. Duration: 100ms.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          function_name: 'mock_mcp_tool',
          function_args: JSON.stringify(
            {
              arg1: 'value1',
              arg2: 2,
            },
            null,
            2,
          ),
          duration_ms: 100,
          success: true,
          prompt_id: 'prompt-id',
          tool_type: 'mcp',
          mcp_server_name: 'mock_mcp_server',
          decision: undefined,
          error: undefined,
          error_type: undefined,
          metadata: undefined,
        },
      });
    });
  });

  describe('logMalformedJsonResponse', () => {
    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logMalformedJsonResponseEvent');
    });

    it('logs the event to Clearcut and OTEL', () => {
      const mockConfig = makeFakeConfig();
      const event = new MalformedJsonResponseEvent('test-model');

      logMalformedJsonResponse(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logMalformedJsonResponseEvent,
      ).toHaveBeenCalledWith(event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Malformed JSON response from test-model.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_MALFORMED_JSON_RESPONSE,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          model: 'test-model',
        },
      });
    });
  });

  describe('logFileOperation', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getTargetDir: () => 'target-dir',
      getUsageStatisticsEnabled: () => true,
      getTelemetryEnabled: () => true,
      getTelemetryLogPromptsEnabled: () => true,
    } as Config;

    const mockMetrics = {
      recordFileOperationMetric: vi.fn(),
    };

    beforeEach(() => {
      vi.spyOn(metrics, 'recordFileOperationMetric').mockImplementation(
        mockMetrics.recordFileOperationMetric,
      );
    });

    it('should log a file operation event', () => {
      const event = new FileOperationEvent(
        'test-tool',
        FileOperation.READ,
        10,
        'text/plain',
        '.txt',
        'typescript',
      );

      logFileOperation(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'File operation: read. Lines: 10.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_FILE_OPERATION,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          tool_name: 'test-tool',
          operation: 'read',
          lines: 10,
          mimetype: 'text/plain',
          extension: '.txt',
          programming_language: 'typescript',
        },
      });

      expect(mockMetrics.recordFileOperationMetric).toHaveBeenCalledWith(
        mockConfig,
        {
          operation: 'read',
          lines: 10,
          mimetype: 'text/plain',
          extension: '.txt',
          programming_language: 'typescript',
        },
      );
    });
  });

  describe('logToolOutputTruncated', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
    } as unknown as Config;

    it('should log a tool output truncated event', () => {
      const event = new ToolOutputTruncatedEvent('prompt-id-1', {
        toolName: 'test-tool',
        originalContentLength: 1000,
        truncatedContentLength: 100,
        threshold: 500,
        lines: 10,
      });

      logToolOutputTruncated(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Tool output truncated for test-tool.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_TOOL_OUTPUT_TRUNCATED,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          eventName: 'tool_output_truncated',
          prompt_id: 'prompt-id-1',
          tool_name: 'test-tool',
          original_content_length: 1000,
          truncated_content_length: 100,
          threshold: 500,
          lines: 10,
        },
      });
    });
  });

  describe('logModelRouting', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logModelRoutingEvent');
      vi.spyOn(metrics, 'recordModelRoutingMetrics');
    });

    it('should log the event to Clearcut and OTEL, and record metrics', () => {
      const event = new ModelRoutingEvent(
        'gemini-pro',
        'default',
        100,
        'test-reason',
        false,
        undefined,
      );

      logModelRouting(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logModelRoutingEvent,
      ).toHaveBeenCalledWith(event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Model routing decision. Model: gemini-pro, Source: default',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          ...event,
          'event.name': EVENT_MODEL_ROUTING,
        },
      });

      expect(metrics.recordModelRoutingMetrics).toHaveBeenCalledWith(
        mockConfig,
        event,
      );
    });

    it('should only log to Clearcut if OTEL SDK is not initialized', () => {
      vi.spyOn(sdk, 'isTelemetrySdkInitialized').mockReturnValue(false);
      const event = new ModelRoutingEvent(
        'gemini-pro',
        'default',
        100,
        'test-reason',
        false,
        undefined,
      );

      logModelRouting(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logModelRoutingEvent,
      ).toHaveBeenCalledWith(event);
      expect(mockLogger.emit).not.toHaveBeenCalled();
      expect(metrics.recordModelRoutingMetrics).not.toHaveBeenCalled();
    });
  });

  describe('logExtensionInstall', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logExtensionInstallEvent');
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it('should log extension install event', () => {
      const event = new ExtensionInstallEvent(
        'vscode',
        '0.1.0',
        'git',
        'success',
      );

      logExtensionInstallEvent(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logExtensionInstallEvent,
      ).toHaveBeenCalledWith(event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Installed extension vscode',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_EXTENSION_INSTALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          extension_name: 'vscode',
          extension_version: '0.1.0',
          extension_source: 'git',
          status: 'success',
        },
      });
    });
  });

  describe('logExtensionUninstall', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logExtensionUninstallEvent');
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it('should log extension uninstall event', () => {
      const event = new ExtensionUninstallEvent('vscode', 'success');

      logExtensionUninstall(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logExtensionUninstallEvent,
      ).toHaveBeenCalledWith(event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Uninstalled extension vscode',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_EXTENSION_UNINSTALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          extension_name: 'vscode',
          status: 'success',
        },
      });
    });
  });

  describe('logExtensionEnable', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logExtensionEnableEvent');
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it('should log extension enable event', () => {
      const event = new ExtensionEnableEvent('vscode', 'user');

      logExtensionEnable(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logExtensionEnableEvent,
      ).toHaveBeenCalledWith(event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Enabled extension vscode',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_EXTENSION_ENABLE,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          extension_name: 'vscode',
          setting_scope: 'user',
        },
      });
    });
  });

  describe('logExtensionDisable', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logExtensionDisableEvent');
    });

    afterEach(() => {
      vi.resetAllMocks();
    });

    it('should log extension disable event', () => {
      const event = new ExtensionDisableEvent('vscode', 'user');

      logExtensionDisable(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logExtensionDisableEvent,
      ).toHaveBeenCalledWith(event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Disabled extension vscode',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'event.name': EVENT_EXTENSION_DISABLE,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          extension_name: 'vscode',
          setting_scope: 'user',
        },
      });
    });
  });
});
