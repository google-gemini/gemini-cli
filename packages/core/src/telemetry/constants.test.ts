/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import * as constants from './constants.js';

describe('telemetry constants', () => {
  describe('SERVICE_NAME', () => {
    it('should be defined', () => {
      expect(constants.SERVICE_NAME).toBeDefined();
    });

    it('should equal gemini-cli', () => {
      expect(constants.SERVICE_NAME).toBe('gemini-cli');
    });

    it('should be a string', () => {
      expect(typeof constants.SERVICE_NAME).toBe('string');
    });
  });

  describe('event constants', () => {
    it('should have EVENT_USER_PROMPT', () => {
      expect(constants.EVENT_USER_PROMPT).toBe('gemini_cli.user_prompt');
    });

    it('should have EVENT_TOOL_CALL', () => {
      expect(constants.EVENT_TOOL_CALL).toBe('gemini_cli.tool_call');
    });

    it('should have EVENT_API_REQUEST', () => {
      expect(constants.EVENT_API_REQUEST).toBe('gemini_cli.api_request');
    });

    it('should have EVENT_API_ERROR', () => {
      expect(constants.EVENT_API_ERROR).toBe('gemini_cli.api_error');
    });

    it('should have EVENT_API_RESPONSE', () => {
      expect(constants.EVENT_API_RESPONSE).toBe('gemini_cli.api_response');
    });

    it('should have EVENT_CLI_CONFIG', () => {
      expect(constants.EVENT_CLI_CONFIG).toBe('gemini_cli.config');
    });

    it('should have EVENT_EXTENSION_DISABLE', () => {
      expect(constants.EVENT_EXTENSION_DISABLE).toBe(
        'gemini_cli.extension_disable',
      );
    });

    it('should have EVENT_EXTENSION_ENABLE', () => {
      expect(constants.EVENT_EXTENSION_ENABLE).toBe(
        'gemini_cli.extension_enable',
      );
    });

    it('should have EVENT_EXTENSION_INSTALL', () => {
      expect(constants.EVENT_EXTENSION_INSTALL).toBe(
        'gemini_cli.extension_install',
      );
    });

    it('should have EVENT_EXTENSION_UNINSTALL', () => {
      expect(constants.EVENT_EXTENSION_UNINSTALL).toBe(
        'gemini_cli.extension_uninstall',
      );
    });

    it('should have EVENT_FLASH_FALLBACK', () => {
      expect(constants.EVENT_FLASH_FALLBACK).toBe('gemini_cli.flash_fallback');
    });

    it('should have EVENT_RIPGREP_FALLBACK', () => {
      expect(constants.EVENT_RIPGREP_FALLBACK).toBe(
        'gemini_cli.ripgrep_fallback',
      );
    });

    it('should have EVENT_NEXT_SPEAKER_CHECK', () => {
      expect(constants.EVENT_NEXT_SPEAKER_CHECK).toBe(
        'gemini_cli.next_speaker_check',
      );
    });

    it('should have EVENT_SLASH_COMMAND', () => {
      expect(constants.EVENT_SLASH_COMMAND).toBe('gemini_cli.slash_command');
    });

    it('should have EVENT_IDE_CONNECTION', () => {
      expect(constants.EVENT_IDE_CONNECTION).toBe('gemini_cli.ide_connection');
    });

    it('should have EVENT_CONVERSATION_FINISHED', () => {
      expect(constants.EVENT_CONVERSATION_FINISHED).toBe(
        'gemini_cli.conversation_finished',
      );
    });

    it('should have EVENT_CHAT_COMPRESSION', () => {
      expect(constants.EVENT_CHAT_COMPRESSION).toBe(
        'gemini_cli.chat_compression',
      );
    });

    it('should have EVENT_MALFORMED_JSON_RESPONSE', () => {
      expect(constants.EVENT_MALFORMED_JSON_RESPONSE).toBe(
        'gemini_cli.malformed_json_response',
      );
    });

    it('should have EVENT_INVALID_CHUNK', () => {
      expect(constants.EVENT_INVALID_CHUNK).toBe(
        'gemini_cli.chat.invalid_chunk',
      );
    });

    it('should have EVENT_CONTENT_RETRY', () => {
      expect(constants.EVENT_CONTENT_RETRY).toBe(
        'gemini_cli.chat.content_retry',
      );
    });

    it('should have EVENT_CONTENT_RETRY_FAILURE', () => {
      expect(constants.EVENT_CONTENT_RETRY_FAILURE).toBe(
        'gemini_cli.chat.content_retry_failure',
      );
    });

    it('should have EVENT_FILE_OPERATION', () => {
      expect(constants.EVENT_FILE_OPERATION).toBe('gemini_cli.file_operation');
    });

    it('should have EVENT_MODEL_SLASH_COMMAND', () => {
      expect(constants.EVENT_MODEL_SLASH_COMMAND).toBe(
        'gemini_cli.slash_command.model',
      );
    });

    it('should have EVENT_MODEL_ROUTING', () => {
      expect(constants.EVENT_MODEL_ROUTING).toBe('gemini_cli.model_routing');
    });
  });

  describe('metric constants', () => {
    it('should have METRIC_TOOL_CALL_COUNT', () => {
      expect(constants.METRIC_TOOL_CALL_COUNT).toBe(
        'gemini_cli.tool.call.count',
      );
    });

    it('should have METRIC_TOOL_CALL_LATENCY', () => {
      expect(constants.METRIC_TOOL_CALL_LATENCY).toBe(
        'gemini_cli.tool.call.latency',
      );
    });

    it('should have METRIC_API_REQUEST_COUNT', () => {
      expect(constants.METRIC_API_REQUEST_COUNT).toBe(
        'gemini_cli.api.request.count',
      );
    });

    it('should have METRIC_API_REQUEST_LATENCY', () => {
      expect(constants.METRIC_API_REQUEST_LATENCY).toBe(
        'gemini_cli.api.request.latency',
      );
    });

    it('should have METRIC_TOKEN_USAGE', () => {
      expect(constants.METRIC_TOKEN_USAGE).toBe('gemini_cli.token.usage');
    });

    it('should have METRIC_SESSION_COUNT', () => {
      expect(constants.METRIC_SESSION_COUNT).toBe('gemini_cli.session.count');
    });

    it('should have METRIC_FILE_OPERATION_COUNT', () => {
      expect(constants.METRIC_FILE_OPERATION_COUNT).toBe(
        'gemini_cli.file.operation.count',
      );
    });

    it('should have METRIC_INVALID_CHUNK_COUNT', () => {
      expect(constants.METRIC_INVALID_CHUNK_COUNT).toBe(
        'gemini_cli.chat.invalid_chunk.count',
      );
    });

    it('should have METRIC_CONTENT_RETRY_COUNT', () => {
      expect(constants.METRIC_CONTENT_RETRY_COUNT).toBe(
        'gemini_cli.chat.content_retry.count',
      );
    });

    it('should have METRIC_CONTENT_RETRY_FAILURE_COUNT', () => {
      expect(constants.METRIC_CONTENT_RETRY_FAILURE_COUNT).toBe(
        'gemini_cli.chat.content_retry_failure.count',
      );
    });

    it('should have METRIC_MODEL_ROUTING_LATENCY', () => {
      expect(constants.METRIC_MODEL_ROUTING_LATENCY).toBe(
        'gemini_cli.model_routing.latency',
      );
    });

    it('should have METRIC_MODEL_ROUTING_FAILURE_COUNT', () => {
      expect(constants.METRIC_MODEL_ROUTING_FAILURE_COUNT).toBe(
        'gemini_cli.model_routing.failure.count',
      );
    });

    it('should have METRIC_MODEL_SLASH_COMMAND_CALL_COUNT', () => {
      expect(constants.METRIC_MODEL_SLASH_COMMAND_CALL_COUNT).toBe(
        'gemini_cli.slash_command.model.call_count',
      );
    });
  });

  describe('performance metrics', () => {
    it('should have METRIC_STARTUP_TIME', () => {
      expect(constants.METRIC_STARTUP_TIME).toBe('gemini_cli.startup.duration');
    });

    it('should have METRIC_MEMORY_USAGE', () => {
      expect(constants.METRIC_MEMORY_USAGE).toBe('gemini_cli.memory.usage');
    });

    it('should have METRIC_CPU_USAGE', () => {
      expect(constants.METRIC_CPU_USAGE).toBe('gemini_cli.cpu.usage');
    });

    it('should have METRIC_TOOL_QUEUE_DEPTH', () => {
      expect(constants.METRIC_TOOL_QUEUE_DEPTH).toBe(
        'gemini_cli.tool.queue.depth',
      );
    });

    it('should have METRIC_TOOL_EXECUTION_BREAKDOWN', () => {
      expect(constants.METRIC_TOOL_EXECUTION_BREAKDOWN).toBe(
        'gemini_cli.tool.execution.breakdown',
      );
    });

    it('should have METRIC_TOKEN_EFFICIENCY', () => {
      expect(constants.METRIC_TOKEN_EFFICIENCY).toBe(
        'gemini_cli.token.efficiency',
      );
    });

    it('should have METRIC_API_REQUEST_BREAKDOWN', () => {
      expect(constants.METRIC_API_REQUEST_BREAKDOWN).toBe(
        'gemini_cli.api.request.breakdown',
      );
    });

    it('should have METRIC_PERFORMANCE_SCORE', () => {
      expect(constants.METRIC_PERFORMANCE_SCORE).toBe(
        'gemini_cli.performance.score',
      );
    });

    it('should have METRIC_REGRESSION_DETECTION', () => {
      expect(constants.METRIC_REGRESSION_DETECTION).toBe(
        'gemini_cli.performance.regression',
      );
    });

    it('should have METRIC_REGRESSION_PERCENTAGE_CHANGE', () => {
      expect(constants.METRIC_REGRESSION_PERCENTAGE_CHANGE).toBe(
        'gemini_cli.performance.regression.percentage_change',
      );
    });

    it('should have METRIC_BASELINE_COMPARISON', () => {
      expect(constants.METRIC_BASELINE_COMPARISON).toBe(
        'gemini_cli.performance.baseline.comparison',
      );
    });
  });

  describe('performance events', () => {
    it('should have EVENT_STARTUP_PERFORMANCE', () => {
      expect(constants.EVENT_STARTUP_PERFORMANCE).toBe(
        'gemini_cli.startup.performance',
      );
    });

    it('should have EVENT_MEMORY_USAGE', () => {
      expect(constants.EVENT_MEMORY_USAGE).toBe('gemini_cli.memory.usage');
    });

    it('should have EVENT_PERFORMANCE_BASELINE', () => {
      expect(constants.EVENT_PERFORMANCE_BASELINE).toBe(
        'gemini_cli.performance.baseline',
      );
    });

    it('should have EVENT_PERFORMANCE_REGRESSION', () => {
      expect(constants.EVENT_PERFORMANCE_REGRESSION).toBe(
        'gemini_cli.performance.regression',
      );
    });
  });

  describe('constant naming conventions', () => {
    it('should prefix all events with gemini_cli', () => {
      const eventConstants = Object.entries(constants).filter(([key]) =>
        key.startsWith('EVENT_'),
      );

      eventConstants.forEach(([, value]) => {
        expect(value).toMatch(/^gemini_cli\./);
      });
    });

    it('should prefix all metrics with gemini_cli', () => {
      const metricConstants = Object.entries(constants).filter(([key]) =>
        key.startsWith('METRIC_'),
      );

      metricConstants.forEach(([, value]) => {
        expect(value).toMatch(/^gemini_cli\./);
      });
    });

    it('should use snake_case for event values', () => {
      const eventConstants = Object.entries(constants).filter(([key]) =>
        key.startsWith('EVENT_'),
      );

      eventConstants.forEach(([, value]) => {
        expect(value).toMatch(/^[a-z_.]+$/);
      });
    });

    it('should use snake_case for metric values', () => {
      const metricConstants = Object.entries(constants).filter(([key]) =>
        key.startsWith('METRIC_'),
      );

      metricConstants.forEach(([, value]) => {
        expect(value).toMatch(/^[a-z_.]+$/);
      });
    });

    it('should use UPPER_SNAKE_CASE for constant names', () => {
      const allConstants = Object.keys(constants);

      allConstants.forEach((key) => {
        if (key !== 'SERVICE_NAME') {
          // SERVICE_NAME is special
          expect(key).toMatch(/^(EVENT|METRIC)_[A-Z_]+$/);
        }
      });
    });
  });

  describe('constant uniqueness', () => {
    it('should have unique event values', () => {
      const eventConstants = Object.entries(constants)
        .filter(([key]) => key.startsWith('EVENT_'))
        .map(([, value]) => value);

      const uniqueEvents = new Set(eventConstants);
      expect(uniqueEvents.size).toBe(eventConstants.length);
    });

    it('should have unique metric values', () => {
      const metricConstants = Object.entries(constants)
        .filter(([key]) => key.startsWith('METRIC_'))
        .map(([, value]) => value);

      const uniqueMetrics = new Set(metricConstants);
      expect(uniqueMetrics.size).toBe(metricConstants.length);
    });

    it('should not have overlapping event and metric values', () => {
      const eventValues = Object.entries(constants)
        .filter(([key]) => key.startsWith('EVENT_'))
        .map(([, value]) => value);

      const metricValues = Object.entries(constants)
        .filter(([key]) => key.startsWith('METRIC_'))
        .map(([, value]) => value);

      const intersection = eventValues.filter((v) => metricValues.includes(v));
      expect(intersection).toHaveLength(0);
    });
  });

  describe('constant groups', () => {
    it('should have extension-related events', () => {
      expect(constants.EVENT_EXTENSION_DISABLE).toBeDefined();
      expect(constants.EVENT_EXTENSION_ENABLE).toBeDefined();
      expect(constants.EVENT_EXTENSION_INSTALL).toBeDefined();
      expect(constants.EVENT_EXTENSION_UNINSTALL).toBeDefined();
    });

    it('should have API-related events and metrics', () => {
      expect(constants.EVENT_API_REQUEST).toBeDefined();
      expect(constants.EVENT_API_ERROR).toBeDefined();
      expect(constants.EVENT_API_RESPONSE).toBeDefined();
      expect(constants.METRIC_API_REQUEST_COUNT).toBeDefined();
      expect(constants.METRIC_API_REQUEST_LATENCY).toBeDefined();
    });

    it('should have tool-related metrics', () => {
      expect(constants.METRIC_TOOL_CALL_COUNT).toBeDefined();
      expect(constants.METRIC_TOOL_CALL_LATENCY).toBeDefined();
      expect(constants.METRIC_TOOL_QUEUE_DEPTH).toBeDefined();
      expect(constants.METRIC_TOOL_EXECUTION_BREAKDOWN).toBeDefined();
    });

    it('should have performance-related metrics', () => {
      expect(constants.METRIC_STARTUP_TIME).toBeDefined();
      expect(constants.METRIC_MEMORY_USAGE).toBeDefined();
      expect(constants.METRIC_CPU_USAGE).toBeDefined();
      expect(constants.METRIC_PERFORMANCE_SCORE).toBeDefined();
    });

    it('should have chat-related events', () => {
      expect(constants.EVENT_CHAT_COMPRESSION).toBeDefined();
      expect(constants.EVENT_INVALID_CHUNK).toBeDefined();
      expect(constants.EVENT_CONTENT_RETRY).toBeDefined();
      expect(constants.EVENT_CONTENT_RETRY_FAILURE).toBeDefined();
    });
  });

  describe('constant types', () => {
    it('should export all constants as strings', () => {
      const allConstants = Object.entries(constants);

      allConstants.forEach(([, value]) => {
        expect(typeof value).toBe('string');
      });
    });

    it('should not have empty string values', () => {
      const allConstants = Object.values(constants);

      allConstants.forEach((value) => {
        expect(value.length).toBeGreaterThan(0);
      });
    });
  });

  describe('count of constants', () => {
    it('should have multiple event constants', () => {
      const eventConstants = Object.keys(constants).filter((key) =>
        key.startsWith('EVENT_'),
      );

      expect(eventConstants.length).toBeGreaterThan(20);
    });

    it('should have multiple metric constants', () => {
      const metricConstants = Object.keys(constants).filter((key) =>
        key.startsWith('METRIC_'),
      );

      expect(metricConstants.length).toBeGreaterThan(15);
    });
  });
});
