/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  StartSessionEvent,
  EndSessionEvent,
  ApiRequestEvent,
  ApiResponseEvent,
  ApiErrorEvent,
  ToolCallEvent,
  ToolCallDecision,
} from './types.js';
import { AuthType } from '../core/contentGenerator.js';
import type { Config } from '../config/config.js';
import type { ToolRegistry } from '../tools/tool-registry.js';

describe('telemetry event classes', () => {
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: AuthType.USE_GEMINI,
      }),
      getMcpServers: vi.fn().mockReturnValue({
        server1: {},
        server2: {},
      }),
      getModel: vi.fn().mockReturnValue('gemini-2.0-flash'),
      getEmbeddingModel: vi.fn().mockReturnValue('text-embedding-004'),
      getSandbox: vi.fn().mockReturnValue(undefined),
      getCoreTools: vi.fn().mockReturnValue(['read', 'write']),
      getApprovalMode: vi.fn().mockReturnValue('default'),
      getDebugMode: vi.fn().mockReturnValue(false),
      getTelemetryEnabled: vi.fn().mockReturnValue(true),
      getTelemetryLogPromptsEnabled: vi.fn().mockReturnValue(false),
      getFileFilteringRespectGitIgnore: vi.fn().mockReturnValue(true),
      getSessionId: vi.fn().mockReturnValue('session-123'),
      getOutputFormat: vi.fn().mockReturnValue('text' as unknown),
    } as unknown;
  });

  describe('StartSessionEvent', () => {
    it('should create event with correct config values', () => {
      const event = new StartSessionEvent(mockConfig);

      expect(event['event.name']).toBe('cli_config');
      expect(event.model).toBe('gemini-2.0-flash');
      expect(event.embedding_model).toBe('text-embedding-004');
      expect(event.sandbox_enabled).toBe(false);
      expect(event.core_tools_enabled).toBe('read,write');
      expect(event.approval_mode).toBe('default');
      expect(event.api_key_enabled).toBe(true);
      expect(event.vertex_ai_enabled).toBe(false);
      expect(event.debug_enabled).toBe(false);
      expect(event.mcp_servers).toBe('server1,server2');
      expect(event.mcp_servers_count).toBe(2);
      expect(event.telemetry_enabled).toBe(true);
      expect(event.telemetry_log_user_prompts_enabled).toBe(false);
      expect(event.file_filtering_respect_git_ignore).toBe(true);
      expect(event.output_format).toBe('text');
    });

    it('should handle sandbox being enabled', () => {
      vi.mocked(mockConfig.getSandbox).mockReturnValue('docker');
      const event = new StartSessionEvent(mockConfig);
      expect(event.sandbox_enabled).toBe(true);
    });

    it('should handle Vertex AI auth type', () => {
      vi.mocked(mockConfig.getContentGeneratorConfig).mockReturnValue({
        authType: AuthType.USE_VERTEX_AI,
      });

      const event = new StartSessionEvent(mockConfig);
      expect(event.vertex_ai_enabled).toBe(true);
      expect(event.api_key_enabled).toBe(true);
    });

    it('should handle no MCP servers', () => {
      vi.mocked(mockConfig.getMcpServers).mockReturnValue(undefined);

      const event = new StartSessionEvent(mockConfig);
      expect(event.mcp_servers).toBe('');
      expect(event.mcp_servers_count).toBe(0);
    });

    it('should include MCP tools when toolRegistry provided', () => {
      const mockToolRegistry: ToolRegistry = {
        getAllTools: vi.fn().mockReturnValue([]),
      } as unknown;

      const event = new StartSessionEvent(mockConfig, mockToolRegistry);
      expect(event.mcp_tools_count).toBe(0);
      expect(event.mcp_tools).toBe('');
    });

    it('should handle undefined core tools', () => {
      vi.mocked(mockConfig.getCoreTools).mockReturnValue(undefined);

      const event = new StartSessionEvent(mockConfig);
      expect(event.core_tools_enabled).toBe('');
    });
  });

  describe('EndSessionEvent', () => {
    it('should create event with session id', () => {
      const event = new EndSessionEvent(mockConfig);

      expect(event['event.name']).toBe('end_session');
      expect(event.session_id).toBe('session-123');
      expect(event['event.timestamp']).toBeDefined();
    });

    it('should handle missing config', () => {
      const event = new EndSessionEvent();

      expect(event['event.name']).toBe('end_session');
      expect(event.session_id).toBeUndefined();
    });

    it('should include ISO timestamp', () => {
      const event = new EndSessionEvent(mockConfig);
      expect(event['event.timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('ApiRequestEvent', () => {
    it('should create event with request details', () => {
      const event = new ApiRequestEvent(
        'gemini-2.0-flash',
        'prompt-123',
        '{"test": "data"}',
      );

      expect(event['event.name']).toBe('api_request');
      expect(event.model).toBe('gemini-2.0-flash');
      expect(event.prompt_id).toBe('prompt-123');
      expect(event.request_text).toBe('{"test": "data"}');
      expect(event['event.timestamp']).toBeDefined();
    });

    it('should include ISO timestamp', () => {
      const event = new ApiRequestEvent('model', 'prompt', 'text');
      expect(event['event.timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('ApiResponseEvent', () => {
    it('should create event with response details', () => {
      const usageMetadata = {
        promptTokenCount: 100,
        candidatesTokenCount: 200,
        totalTokenCount: 300,
      };

      const event = new ApiResponseEvent(
        'gemini-2.0-flash',
        1500,
        'prompt-123',
        AuthType.USE_GEMINI,
        usageMetadata,
        '{"response": "data"}',
      );

      expect(event['event.name']).toBe('api_response');
      expect(event.model).toBe('gemini-2.0-flash');
      expect(event.duration_ms).toBe(1500);
      expect(event.prompt_id).toBe('prompt-123');
      expect(event.auth_type).toBe(AuthType.USE_GEMINI);
      expect(event.usage_metadata).toEqual(usageMetadata);
      expect(event.response_text).toBe('{"response": "data"}');
      expect(event['event.timestamp']).toBeDefined();
    });

    it('should handle missing optional parameters', () => {
      const event = new ApiResponseEvent('model', 1000, 'prompt', undefined);

      expect(event.auth_type).toBeUndefined();
      expect(event.usage_metadata).toBeUndefined();
      expect(event.response_text).toBeUndefined();
    });
  });

  describe('ApiErrorEvent', () => {
    it('should create event with error details', () => {
      const event = new ApiErrorEvent(
        'gemini-2.0-flash',
        'Request failed',
        2000,
        'prompt-123',
        AuthType.USE_GEMINI,
        'NetworkError',
        500,
      );

      expect(event['event.name']).toBe('api_error');
      expect(event.model).toBe('gemini-2.0-flash');
      expect(event.error_message).toBe('Request failed');
      expect(event.duration_ms).toBe(2000);
      expect(event.prompt_id).toBe('prompt-123');
      expect(event.auth_type).toBe(AuthType.USE_GEMINI);
      expect(event.error_type).toBe('NetworkError');
      expect(event.status_code).toBe(500);
      expect(event['event.timestamp']).toBeDefined();
    });

    it('should handle missing optional parameters', () => {
      const event = new ApiErrorEvent('model', 'error', 1000, 'prompt');

      expect(event.auth_type).toBeUndefined();
      expect(event.error_type).toBeUndefined();
      expect(event.status_code).toBeUndefined();
    });
  });

  describe('ToolCallEvent', () => {
    it('should create event with tool call details for approved outcome', () => {
      const completedToolCall = {
        name: 'read',
        input: { path: 'file.txt' },
        decision: ToolCallDecision.APPROVED,
        output: 'file contents',
        success: true,
        duration: 100,
        error: undefined,
      };

      const event = new ToolCallEvent(completedToolCall as unknown, 5);

      expect(event['event.name']).toBe('tool_call');
      expect(event.tool_name).toBe('read');
      expect(event.decision).toBe(ToolCallDecision.APPROVED);
      expect(event.success).toBe(true);
      expect(event.duration_ms).toBe(100);
      expect(event.queue_depth).toBe(5);
      expect(event['event.timestamp']).toBeDefined();
    });

    it('should include error message for failed tool calls', () => {
      const completedToolCall = {
        name: 'write',
        input: { path: 'file.txt', content: 'data' },
        decision: ToolCallDecision.APPROVED,
        output: undefined,
        success: false,
        duration: 50,
        error: 'Permission denied',
      };

      const event = new ToolCallEvent(completedToolCall as unknown, 2);

      expect(event.success).toBe(false);
      expect(event.error_message).toBe('Permission denied');
    });

    it('should handle different decisions', () => {
      const rejectedToolCall = {
        name: 'bash',
        input: { command: 'rm -rf /' },
        decision: ToolCallDecision.REJECTED,
        output: undefined,
        success: false,
        duration: 0,
      };

      const event = new ToolCallEvent(rejectedToolCall as unknown, 0);
      expect(event.decision).toBe(ToolCallDecision.REJECTED);
    });
  });
});
