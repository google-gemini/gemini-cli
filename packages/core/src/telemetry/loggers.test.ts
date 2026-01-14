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
  type MessageBus,
} from '../index.js';
import { OutputFormat } from '../output/types.js';
import { logs } from '@opentelemetry/api-logs';
import type { Config } from '../config/config.js';
import {
  logApiError,
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
  logAgentStart,
  logAgentFinish,
  logWebFetchFallbackAttempt,
  logExtensionUpdateEvent,
  logHookCall,
} from './loggers.js';
import { ToolCallDecision } from './tool-call-decision.js';
import {
  EVENT_API_ERROR,
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
  EVENT_AGENT_START,
  EVENT_AGENT_FINISH,
  EVENT_WEB_FETCH_FALLBACK_ATTEMPT,
  ApiErrorEvent,
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
  AgentStartEvent,
  AgentFinishEvent,
  WebFetchFallbackAttemptEvent,
  ExtensionUpdateEvent,
  EVENT_EXTENSION_UPDATE,
  HookCallEvent,
  EVENT_HOOK_CALL,
} from './types.js';
import * as metrics from './metrics.js';
import { FileOperation } from './metrics.js';
import * as sdk from './sdk.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { vi, describe, beforeEach, it, expect, afterEach } from 'vitest';
import { type GeminiCLIExtension } from '../config/config.js';
import {
  FinishReason,
  type CallableTool,
  type GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import * as uiTelemetry from './uiTelemetry.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { ClearcutLogger } from './clearcut-logger/clearcut-logger.js';
import { UserAccountManager } from '../utils/userAccountManager.js';
import { InstallationManager } from '../utils/installationManager.js';
import { AgentTerminateMode } from '../agents/types.js';

vi.mock('systeminformation', () => ({
  default: {
    graphics: vi.fn().mockResolvedValue({
      controllers: [{ model: 'Mock GPU' }],
    }),
  },
}));

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
    vi.spyOn(sdk, 'bufferTelemetryEvent').mockImplementation((cb) => cb());
    vi.spyOn(logs, 'getLogger').mockReturnValue(mockLogger);
    vi.spyOn(uiTelemetry.uiTelemetryService, 'addEvent').mockImplementation(
      mockUiEvent.addEvent,
    );
    vi.spyOn(
      UserAccountManager.prototype,
      'getCachedGoogleAccount',
    ).mockReturnValue('test-user@example.com');
    vi.spyOn(
      InstallationManager.prototype,
      'getInstallationId',
    ).mockReturnValue('test-installation-id');
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
        getMcpServers: () => {
          throw new Error('Should not call');
        },
        getQuestion: () => 'test-question',
        getTargetDir: () => 'target-dir',
        getProxy: () => 'http://test.proxy.com:8080',
        getOutputFormat: () => OutputFormat.JSON,
        getExtensions: () =>
          [
            { name: 'ext-one', id: 'id-one' },
            { name: 'ext-two', id: 'id-two' },
          ] as GeminiCLIExtension[],
        getMcpClientManager: () => ({
          getMcpServers: () => ({
            'test-server': {
              command: 'test-command',
            },
          }),
        }),
        isInteractive: () => false,
      } as unknown as Config;

      const startSessionEvent = new StartSessionEvent(mockConfig);
      logCliConfiguration(mockConfig, startSessionEvent);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'CLI configuration loaded.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'installation.id': 'test-installation-id',
          'event.name': EVENT_CLI_CONFIG,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
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
          extension_ids: 'id-one,id-two',
          extensions_count: 2,
          extensions: 'ext-one,ext-two',
          auth_type: 'vertex-ai',
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
      isInteractive: () => false,
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
          'installation.id': 'test-installation-id',
          'event.name': EVENT_USER_PROMPT,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
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
        isInteractive: () => false,
      } as unknown as Config;
      const event = new UserPromptEvent(
        11,
        'prompt-id-9',
        AuthType.COMPUTE_ADC,
        'test-prompt',
      );

      logUserPrompt(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'User prompt. Length: 11.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'installation.id': 'test-installation-id',
          'event.name': EVENT_USER_PROMPT,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
          prompt_length: 11,
          prompt_id: 'prompt-id-9',
          auth_type: 'compute-default-credentials',
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
      isInteractive: () => false,
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
        {
          prompt_id: 'prompt-id-1',
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Hello' }],
            },
          ],
          generate_content_config: {
            temperature: 1,
            topP: 2,
            topK: 3,
            responseMimeType: 'text/plain',
            candidateCount: 1,
            seed: 678,
            frequencyPenalty: 10,
            maxOutputTokens: 8000,
            presencePenalty: 6,
            stopSequences: ['stop', 'please stop'],
            systemInstruction: {
              role: 'model',
              parts: [{ text: 'be nice' }],
            },
          },
          server: {
            address: 'foo.com',
            port: 8080,
          },
        },
        {
          response_id: '',
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'candidate 1' }],
              },
              finishReason: FinishReason.STOP,
            },
          ],
        },
        AuthType.LOGIN_WITH_GOOGLE,
        usageData,
        'test-response',
      );

      logApiResponse(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'API response from test-model. Status: 200. Duration: 100ms.',
        attributes: expect.objectContaining({
          'event.name': EVENT_API_RESPONSE,
          prompt_id: 'prompt-id-1',
          finish_reasons: ['stop'],
        }),
      });

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'GenAI operation details from test-model. Status: 200. Duration: 100ms.',
        attributes: expect.objectContaining({
          'event.name': 'gen_ai.client.inference.operation.details',
          'gen_ai.request.model': 'test-model',
          'gen_ai.request.temperature': 1,
          'gen_ai.request.top_p': 2,
          'gen_ai.request.top_k': 3,
          'gen_ai.input.messages':
            '[{"role":"user","parts":[{"type":"text","content":"Hello"}]}]',
          'gen_ai.output.messages':
            '[{"finish_reason":"stop","role":"system","parts":[{"type":"text","content":"candidate 1"}]}]',
          'gen_ai.response.finish_reasons': ['stop'],
          'gen_ai.response.model': 'test-model',
          'gen_ai.usage.input_tokens': 17,
          'gen_ai.usage.output_tokens': 50,
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.output.type': 'text',
          'gen_ai.request.choice.count': 1,
          'gen_ai.request.seed': 678,
          'gen_ai.request.frequency_penalty': 10,
          'gen_ai.request.presence_penalty': 6,
          'gen_ai.request.max_tokens': 8000,
          'server.address': 'foo.com',
          'server.port': 8080,
          'gen_ai.request.stop_sequences': ['stop', 'please stop'],
          'gen_ai.system_instructions': '[{"type":"text","content":"be nice"}]',
        }),
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

  describe('logApiError', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getTargetDir: () => 'target-dir',
      getUsageStatisticsEnabled: () => true,
      getTelemetryEnabled: () => true,
      getTelemetryLogPromptsEnabled: () => true,
      isInteractive: () => false,
    } as Config;

    const mockMetrics = {
      recordApiResponseMetrics: vi.fn(),
      recordApiErrorMetrics: vi.fn(),
      recordTokenUsageMetrics: vi.fn(),
    };

    beforeEach(() => {
      vi.spyOn(metrics, 'recordApiResponseMetrics').mockImplementation(
        mockMetrics.recordApiResponseMetrics,
      );
      vi.spyOn(metrics, 'recordApiErrorMetrics').mockImplementation(
        mockMetrics.recordApiErrorMetrics,
      );
    });

    it('should log an API error with all fields', () => {
      const event = new ApiErrorEvent(
        'test-model',
        'UNAVAILABLE. {"error":{"code":503,"message":"The model is overloaded. Please try again later.","status":"UNAVAILABLE"}}',
        100,
        {
          prompt_id: 'prompt-id-1',
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Hello' }],
            },
          ],
          generate_content_config: {
            temperature: 1,
            topP: 2,
            topK: 3,
            responseMimeType: 'text/plain',
            candidateCount: 1,
            seed: 678,
            frequencyPenalty: 10,
            maxOutputTokens: 8000,
            presencePenalty: 6,
            stopSequences: ['stop', 'please stop'],
            systemInstruction: {
              role: 'model',
              parts: [{ text: 'be nice' }],
            },
          },
          server: {
            address: 'foo.com',
            port: 8080,
          },
        },
        AuthType.LOGIN_WITH_GOOGLE,
        'ApiError',
        503,
      );

      logApiError(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'API error for test-model. Error: UNAVAILABLE. {"error":{"code":503,"message":"The model is overloaded. Please try again later.","status":"UNAVAILABLE"}}. Duration: 100ms.',
        attributes: expect.objectContaining({
          'event.name': EVENT_API_ERROR,
          prompt_id: 'prompt-id-1',
        }),
      });

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'GenAI operation error details from test-model. Error: UNAVAILABLE. {"error":{"code":503,"message":"The model is overloaded. Please try again later.","status":"UNAVAILABLE"}}. Duration: 100ms.',
        attributes: expect.objectContaining({
          'event.name': 'gen_ai.client.inference.operation.details',
          'gen_ai.request.model': 'test-model',
          'gen_ai.request.temperature': 1,
          'gen_ai.request.top_p': 2,
          'gen_ai.request.top_k': 3,
          'gen_ai.input.messages':
            '[{"role":"user","parts":[{"type":"text","content":"Hello"}]}]',
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.output.type': 'text',
          'gen_ai.request.choice.count': 1,
          'gen_ai.request.seed': 678,
          'gen_ai.request.frequency_penalty': 10,
          'gen_ai.request.presence_penalty': 6,
          'gen_ai.request.max_tokens': 8000,
          'server.address': 'foo.com',
          'server.port': 8080,
          'gen_ai.request.stop_sequences': ['stop', 'please stop'],
          'gen_ai.system_instructions': '[{"type":"text","content":"be nice"}]',
        }),
      });

      expect(mockMetrics.recordApiErrorMetrics).toHaveBeenCalledWith(
        mockConfig,
        100,
        {
          model: 'test-model',
          status_code: 503,
          error_type: 'ApiError',
        },
      );

      expect(mockMetrics.recordApiResponseMetrics).toHaveBeenCalledWith(
        mockConfig,
        100,
        {
          model: 'test-model',
          status_code: 503,
          genAiAttributes: {
            'gen_ai.operation.name': 'generate_content',
            'gen_ai.provider.name': 'gcp.vertex_ai',
            'gen_ai.request.model': 'test-model',
            'gen_ai.response.model': 'test-model',
            'error.type': 'ApiError',
          },
        },
      );

      expect(mockUiEvent.addEvent).toHaveBeenCalledWith({
        ...event,
        'event.name': EVENT_API_ERROR,
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
      isInteractive: () => false,
      getContentGeneratorConfig: () => ({
        authType: AuthType.LOGIN_WITH_GOOGLE,
      }),
    } as Config;

    it('should log an API request with request_text', () => {
      const event = new ApiRequestEvent(
        'test-model',
        {
          prompt_id: 'prompt-id-7',
          contents: [],
        },
        'This is a test request',
      );

      logApiRequest(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenNthCalledWith(1, {
        body: 'API request to test-model.',
        attributes: expect.objectContaining({
          'event.name': EVENT_API_REQUEST,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
          model: 'test-model',
          request_text: 'This is a test request',
          prompt_id: 'prompt-id-7',
        }),
      });

      expect(mockLogger.emit).toHaveBeenNthCalledWith(2, {
        body: 'GenAI operation request details from test-model.',
        attributes: expect.objectContaining({
          'event.name': 'gen_ai.client.inference.operation.details',
          'gen_ai.request.model': 'test-model',
          'gen_ai.provider.name': 'gcp.vertex_ai',
        }),
      });
    });

    it('should log an API request without request_text', () => {
      const event = new ApiRequestEvent('test-model', {
        prompt_id: 'prompt-id-6',
        contents: [],
      });

      logApiRequest(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenNthCalledWith(1, {
        body: 'API request to test-model.',
        attributes: expect.objectContaining({
          'event.name': EVENT_API_REQUEST,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
          model: 'test-model',
          prompt_id: 'prompt-id-6',
        }),
      });

      expect(mockLogger.emit).toHaveBeenNthCalledWith(2, {
        body: 'GenAI operation request details from test-model.',
        attributes: expect.objectContaining({
          'event.name': 'gen_ai.client.inference.operation.details',
          'gen_ai.request.model': 'test-model',
          'gen_ai.provider.name': 'gcp.vertex_ai',
        }),
      });
    });

    it('should log an API request with full semantic details when logPrompts is enabled', () => {
      const mockConfigWithPrompts = {
        getSessionId: () => 'test-session-id',
        getTargetDir: () => 'target-dir',
        getUsageStatisticsEnabled: () => true,
        getTelemetryEnabled: () => true,
        getTelemetryLogPromptsEnabled: () => true, // Enabled
        isInteractive: () => false,
        getContentGeneratorConfig: () => ({
          authType: AuthType.USE_GEMINI,
        }),
      } as Config;

      const promptDetails = {
        prompt_id: 'prompt-id-semantic-1',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Semantic request test' }],
          },
        ],
        generate_content_config: {
          temperature: 0.5,
          topP: 0.8,
          topK: 10,
          responseMimeType: 'application/json',
          candidateCount: 1,
          stopSequences: ['end'],
          systemInstruction: {
            role: 'model',
            parts: [{ text: 'be helpful' }],
          },
        },
        server: {
          address: 'semantic-api.example.com',
          port: 8080,
        },
      };

      const event = new ApiRequestEvent(
        'test-model',
        promptDetails,
        'Full semantic request',
      );

      logApiRequest(mockConfigWithPrompts, event);

      // Expect two calls to emit: one for the regular log, one for the semantic log
      expect(mockLogger.emit).toHaveBeenCalledTimes(2);

      // Verify the first (original) log record
      expect(mockLogger.emit).toHaveBeenNthCalledWith(1, {
        body: 'API request to test-model.',
        attributes: expect.objectContaining({
          'event.name': EVENT_API_REQUEST,
          prompt_id: 'prompt-id-semantic-1',
        }),
      });

      // Verify the second (semantic) log record
      expect(mockLogger.emit).toHaveBeenNthCalledWith(2, {
        body: 'GenAI operation request details from test-model.',
        attributes: expect.objectContaining({
          'event.name': 'gen_ai.client.inference.operation.details',
          'gen_ai.request.model': 'test-model',
          'gen_ai.request.temperature': 0.5,
          'gen_ai.request.top_p': 0.8,
          'gen_ai.request.top_k': 10,
          'gen_ai.input.messages': JSON.stringify([
            {
              role: 'user',
              parts: [{ type: 'text', content: 'Semantic request test' }],
            },
          ]),
          'server.address': 'semantic-api.example.com',
          'server.port': 8080,
          'gen_ai.operation.name': 'generate_content',
          'gen_ai.provider.name': 'gcp.gen_ai',
          'gen_ai.output.type': 'json',
          'gen_ai.request.stop_sequences': ['end'],
          'gen_ai.system_instructions': JSON.stringify([
            { type: 'text', content: 'be helpful' },
          ]),
        }),
      });
    });

    it('should log an API request with semantic details, but without prompts when logPrompts is disabled', () => {
      const mockConfigWithoutPrompts = {
        getSessionId: () => 'test-session-id',
        getTargetDir: () => 'target-dir',
        getUsageStatisticsEnabled: () => true,
        getTelemetryEnabled: () => true,
        getTelemetryLogPromptsEnabled: () => false, // Disabled
        isInteractive: () => false,
        getContentGeneratorConfig: () => ({
          authType: AuthType.USE_VERTEX_AI,
        }),
      } as Config;

      const promptDetails = {
        prompt_id: 'prompt-id-semantic-2',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'This prompt should be hidden' }],
          },
        ],
        generate_content_config: {},
        model: 'gemini-1.0-pro',
      };

      const event = new ApiRequestEvent(
        'gemini-1.0-pro',
        promptDetails,
        'Request with hidden prompt',
      );

      logApiRequest(mockConfigWithoutPrompts, event);

      // Expect two calls to emit
      expect(mockLogger.emit).toHaveBeenCalledTimes(2);

      // Get the arguments of the second (semantic) log call
      const semanticLogCall = mockLogger.emit.mock.calls[1][0];

      // Assert on the body
      expect(semanticLogCall.body).toBe(
        'GenAI operation request details from gemini-1.0-pro.',
      );

      // Assert on specific attributes
      const attributes = semanticLogCall.attributes;
      expect(attributes['event.name']).toBe(
        'gen_ai.client.inference.operation.details',
      );
      expect(attributes['gen_ai.request.model']).toBe('gemini-1.0-pro');
      expect(attributes['gen_ai.provider.name']).toBe('gcp.vertex_ai');
      // Ensure prompt messages are NOT included
      expect(attributes['gen_ai.input.messages']).toBeUndefined();
    });

    it('should correctly derive model from prompt details if available in semantic log', () => {
      const mockConfig = {
        getSessionId: () => 'test-session-id',
        getTelemetryEnabled: () => true,
        getTelemetryLogPromptsEnabled: () => true,
        isInteractive: () => false,
        getUsageStatisticsEnabled: () => true,
        getContentGeneratorConfig: () => ({
          authType: AuthType.USE_GEMINI,
        }),
      } as Config;

      const promptDetails = {
        prompt_id: 'prompt-id-semantic-3',
        contents: [],
        model: 'my-custom-model',
      };

      const event = new ApiRequestEvent(
        'my-custom-model',
        promptDetails,
        'Request with custom model',
      );

      logApiRequest(mockConfig, event);

      // Verify the second (semantic) log record
      expect(mockLogger.emit).toHaveBeenNthCalledWith(2, {
        body: 'GenAI operation request details from my-custom-model.',
        attributes: expect.objectContaining({
          'event.name': 'gen_ai.client.inference.operation.details',
          'gen_ai.request.model': 'my-custom-model',
        }),
      });
    });
  });

  describe('logFlashFallback', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      isInteractive: () => false,
    } as unknown as Config;

    it('should log flash fallback event', () => {
      const event = new FlashFallbackEvent(AuthType.USE_VERTEX_AI);

      logFlashFallback(mockConfig, event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Switching to flash as Fallback.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'installation.id': 'test-installation-id',
          'event.name': EVENT_FLASH_FALLBACK,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
          auth_type: 'vertex-ai',
        },
      });
    });
  });

  describe('logRipgrepFallback', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      isInteractive: () => false,
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
          'installation.id': 'test-installation-id',
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
          'installation.id': 'test-installation-id',
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
      getToolRegistry: () =>
        new ToolRegistry(cfg1, {} as unknown as MessageBus),

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
      isInteractive: () => false,
    } as Config;

    const mockMetrics = {
      recordToolCallMetrics: vi.fn(),
      recordLinesChanged: vi.fn(),
    };

    beforeEach(() => {
      vi.spyOn(metrics, 'recordToolCallMetrics').mockImplementation(
        mockMetrics.recordToolCallMetrics,
      );
      vi.spyOn(metrics, 'recordLinesChanged').mockImplementation(
        mockMetrics.recordLinesChanged,
      );
      mockLogger.emit.mockReset();
    });

    it('should log a tool call with all fields', () => {
      const tool = new EditTool(mockConfig, createMockMessageBus());
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
            filePath: 'file.txt',
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
          'installation.id': 'test-installation-id',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
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
          mcp_server_name: undefined,
          extension_id: undefined,
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

      expect(mockMetrics.recordLinesChanged).toHaveBeenCalledWith(
        mockConfig,
        1,
        'added',
        { function_name: 'test-function' },
      );
      expect(mockMetrics.recordLinesChanged).toHaveBeenCalledWith(
        mockConfig,
        2,
        'removed',
        { function_name: 'test-function' },
      );
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
          'installation.id': 'test-installation-id',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
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
          mcp_server_name: undefined,
          extension_id: undefined,
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
        tool: new EditTool(mockConfig, createMockMessageBus()),
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
          'installation.id': 'test-installation-id',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
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
          mcp_server_name: undefined,
          extension_id: undefined,
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
        tool: new EditTool(mockConfig, createMockMessageBus()),
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
          'installation.id': 'test-installation-id',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
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
          mcp_server_name: undefined,
          extension_id: undefined,
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
          'installation.id': 'test-installation-id',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
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
          mcp_server_name: undefined,
          extension_id: undefined,
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
        createMockMessageBus(),
        false,
        undefined,
        undefined,
        'test-extension',
        'test-extension-id',
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
          'installation.id': 'test-installation-id',
          'event.name': EVENT_TOOL_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          extension_name: 'test-extension',
          extension_id: 'test-extension-id',
          interactive: false,
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
          content_length: undefined,
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
          'installation.id': 'test-installation-id',
          'event.name': EVENT_MALFORMED_JSON_RESPONSE,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
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
      isInteractive: () => false,
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
          'installation.id': 'test-installation-id',
          'event.name': EVENT_FILE_OPERATION,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
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
      isInteractive: () => false,
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
          'installation.id': 'test-installation-id',
          'event.name': EVENT_TOOL_OUTPUT_TRUNCATED,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          eventName: 'tool_output_truncated',
          interactive: false,
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
      isInteractive: () => false,
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
          'installation.id': 'test-installation-id',
          ...event,
          'event.name': EVENT_MODEL_ROUTING,
          interactive: false,
        },
      });

      expect(metrics.recordModelRoutingMetrics).toHaveBeenCalledWith(
        mockConfig,
        event,
      );
    });

    it('should only log to Clearcut if OTEL SDK is not initialized', () => {
      vi.spyOn(sdk, 'isTelemetrySdkInitialized').mockReturnValue(false);
      vi.spyOn(sdk, 'bufferTelemetryEvent').mockImplementation(() => {});
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
      getContentGeneratorConfig: () => null,
      isInteractive: () => false,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logExtensionInstallEvent');
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should log extension install event', async () => {
      const event = new ExtensionInstallEvent(
        'testing',
        'testing-hash',
        'testing-id',
        '0.1.0',
        'git',
        'success',
      );

      await logExtensionInstallEvent(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logExtensionInstallEvent,
      ).toHaveBeenCalledWith(event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Installed extension testing',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'installation.id': 'test-installation-id',
          'event.name': EVENT_EXTENSION_INSTALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
          extension_name: 'testing',
          extension_version: '0.1.0',
          extension_source: 'git',
          status: 'success',
        },
      });
    });
  });

  describe('logExtensionUpdate', async () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      getContentGeneratorConfig: () => null,
      isInteractive: () => false,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logExtensionUpdateEvent');
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should log extension update event', async () => {
      const event = new ExtensionUpdateEvent(
        'testing',
        'testing-hash',
        'testing-id',
        '0.1.0',
        '0.1.1',
        'git',
        'success',
      );

      await logExtensionUpdateEvent(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logExtensionUpdateEvent,
      ).toHaveBeenCalledWith(event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Updated extension testing',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'installation.id': 'test-installation-id',
          'event.name': EVENT_EXTENSION_UPDATE,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
          extension_name: 'testing',
          extension_version: '0.1.0',
          extension_previous_version: '0.1.1',
          extension_source: 'git',
          status: 'success',
        },
      });
    });
  });

  describe('logExtensionUninstall', async () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      getContentGeneratorConfig: () => null,
      isInteractive: () => false,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logExtensionUninstallEvent');
    });

    afterEach(() => {
      vi.clearAllMocks();
    });
    it('should log extension uninstall event', async () => {
      const event = new ExtensionUninstallEvent(
        'testing',
        'testing-hash',
        'testing-id',
        'success',
      );

      await logExtensionUninstall(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logExtensionUninstallEvent,
      ).toHaveBeenCalledWith(event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Uninstalled extension testing',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'installation.id': 'test-installation-id',
          'event.name': EVENT_EXTENSION_UNINSTALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
          extension_name: 'testing',
          status: 'success',
        },
      });
    });
  });

  describe('logExtensionEnable', async () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      isInteractive: () => false,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logExtensionEnableEvent');
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should log extension enable event', async () => {
      const event = new ExtensionEnableEvent(
        'testing',
        'testing-hash',
        'testing-id',
        'user',
      );

      await logExtensionEnable(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logExtensionEnableEvent,
      ).toHaveBeenCalledWith(event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Enabled extension testing',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'installation.id': 'test-installation-id',
          'event.name': EVENT_EXTENSION_ENABLE,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
          extension_name: 'testing',
          setting_scope: 'user',
        },
      });
    });
  });

  describe('logExtensionDisable', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      isInteractive: () => false,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logExtensionDisableEvent');
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should log extension disable event', async () => {
      const event = new ExtensionDisableEvent(
        'testing',
        'testing-hash',
        'testing-id',
        'user',
      );

      await logExtensionDisable(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logExtensionDisableEvent,
      ).toHaveBeenCalledWith(event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Disabled extension testing',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'installation.id': 'test-installation-id',
          'event.name': EVENT_EXTENSION_DISABLE,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
          extension_name: 'testing',
          setting_scope: 'user',
        },
      });
    });
  });

  describe('logAgentStart', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      isInteractive: () => false,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logAgentStartEvent');
    });

    it('should log agent start event', () => {
      const event = new AgentStartEvent('agent-123', 'TestAgent');

      logAgentStart(mockConfig, event);

      expect(ClearcutLogger.prototype.logAgentStartEvent).toHaveBeenCalledWith(
        event,
      );

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Agent TestAgent started. ID: agent-123',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'installation.id': 'test-installation-id',
          'event.name': EVENT_AGENT_START,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
          agent_id: 'agent-123',
          agent_name: 'TestAgent',
        },
      });
    });
  });

  describe('logAgentFinish', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      isInteractive: () => false,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logAgentFinishEvent');
      vi.spyOn(metrics, 'recordAgentRunMetrics');
    });

    it('should log agent finish event and record metrics', () => {
      const event = new AgentFinishEvent(
        'agent-123',
        'TestAgent',
        1000,
        5,
        AgentTerminateMode.GOAL,
      );

      logAgentFinish(mockConfig, event);

      expect(ClearcutLogger.prototype.logAgentFinishEvent).toHaveBeenCalledWith(
        event,
      );

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Agent TestAgent finished. Reason: GOAL. Duration: 1000ms. Turns: 5.',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'installation.id': 'test-installation-id',
          'event.name': EVENT_AGENT_FINISH,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
          agent_id: 'agent-123',
          agent_name: 'TestAgent',
          duration_ms: 1000,
          turn_count: 5,
          terminate_reason: 'GOAL',
        },
      });

      expect(metrics.recordAgentRunMetrics).toHaveBeenCalledWith(
        mockConfig,
        event,
      );
    });
  });

  describe('logWebFetchFallbackAttempt', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      isInteractive: () => false,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logWebFetchFallbackAttemptEvent');
    });

    it('should log web fetch fallback attempt event', () => {
      const event = new WebFetchFallbackAttemptEvent('private_ip');

      logWebFetchFallbackAttempt(mockConfig, event);

      expect(
        ClearcutLogger.prototype.logWebFetchFallbackAttemptEvent,
      ).toHaveBeenCalledWith(event);

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Web fetch fallback attempt. Reason: private_ip',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'installation.id': 'test-installation-id',
          'event.name': EVENT_WEB_FETCH_FALLBACK_ATTEMPT,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
          reason: 'private_ip',
        },
      });
    });
  });

  describe('logHookCall', () => {
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      isInteractive: () => false,
      getTelemetryLogPromptsEnabled: () => false,
    } as unknown as Config;

    beforeEach(() => {
      vi.spyOn(ClearcutLogger.prototype, 'logHookCallEvent');
      vi.spyOn(metrics, 'recordHookCallMetrics');
    });

    it('should log hook call event to Clearcut and OTEL', () => {
      const event = new HookCallEvent(
        'before-tool',
        'command',
        '/path/to/script.sh',
        { arg: 'val' },
        150,
        true,
        { out: 'res' },
        0,
      );

      logHookCall(mockConfig, event);

      expect(ClearcutLogger.prototype.logHookCallEvent).toHaveBeenCalledWith(
        event,
      );

      expect(mockLogger.emit).toHaveBeenCalledWith({
        body: 'Hook call before-tool./path/to/script.sh succeeded in 150ms',
        attributes: {
          'session.id': 'test-session-id',
          'user.email': 'test-user@example.com',
          'installation.id': 'test-installation-id',
          'event.name': EVENT_HOOK_CALL,
          'event.timestamp': '2025-01-01T00:00:00.000Z',
          interactive: false,
          hook_event_name: 'before-tool',
          hook_type: 'command',
          hook_name: 'script.sh', // Sanitized because logPrompts is false
          duration_ms: 150,
          success: true,
          exit_code: 0,
        },
      });

      expect(metrics.recordHookCallMetrics).toHaveBeenCalledWith(
        mockConfig,
        'before-tool',
        '/path/to/script.sh',
        150,
        true,
      );
    });
  });

  describe('Telemetry Buffering', () => {
    it('should buffer events when SDK is not initialized', () => {
      vi.spyOn(sdk, 'isTelemetrySdkInitialized').mockReturnValue(false);
      const bufferSpy = vi
        .spyOn(sdk, 'bufferTelemetryEvent')
        .mockImplementation(() => {});

      const mockConfig = makeFakeConfig();
      const event = new StartSessionEvent(mockConfig);
      logCliConfiguration(mockConfig, event);

      expect(bufferSpy).toHaveBeenCalled();
      expect(mockLogger.emit).not.toHaveBeenCalled();
    });
  });
});
