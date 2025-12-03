/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for telemetry sanitization functions.
 *
 * This test file focuses on validating PII protection through sanitization,
 * particularly for hook names that may contain sensitive information like
 * API keys, credentials, file paths, and command arguments.
 */

import { describe, it, expect } from 'vitest';
import { HookCallEvent, EVENT_HOOK_CALL } from './types.js';
import type { Config } from '../config/config.js';

/**
 * Create a mock config for testing.
 *
 * @param logPromptsEnabled Whether telemetry logging of prompts is enabled.
 * @returns Mock config object.
 */
function createMockConfig(logPromptsEnabled: boolean): Config {
  return {
    getTelemetryLogPromptsEnabled: () => logPromptsEnabled,
    getSessionId: () => 'test-session-id',
    getModel: () => 'gemini-1.5-flash',
    isInteractive: () => true,
    getUserEmail: () => undefined,
  } as unknown as Config;
}

describe('Telemetry Sanitization', () => {
  describe('HookCallEvent', () => {
    describe('constructor', () => {
      it('should create an event with all fields', () => {
        const event = new HookCallEvent(
          'BeforeTool',
          'command',
          'test-hook',
          { tool_name: 'ReadFile' },
          100,
          true,
          { decision: 'allow' },
          0,
          'output',
          'error',
          undefined,
        );

        expect(event['event.name']).toBe('hook_call');
        expect(event.hook_event_name).toBe('BeforeTool');
        expect(event.hook_type).toBe('command');
        expect(event.hook_name).toBe('test-hook');
        expect(event.hook_input).toEqual({ tool_name: 'ReadFile' });
        expect(event.hook_output).toEqual({ decision: 'allow' });
        expect(event.exit_code).toBe(0);
        expect(event.stdout).toBe('output');
        expect(event.stderr).toBe('error');
        expect(event.duration_ms).toBe(100);
        expect(event.success).toBe(true);
        expect(event.error).toBeUndefined();
      });

      it('should create an event with minimal fields', () => {
        const event = new HookCallEvent(
          'BeforeTool',
          'command',
          'test-hook',
          { tool_name: 'ReadFile' },
          100,
          true,
        );

        expect(event.hook_output).toBeUndefined();
        expect(event.exit_code).toBeUndefined();
        expect(event.stdout).toBeUndefined();
        expect(event.stderr).toBeUndefined();
        expect(event.error).toBeUndefined();
      });
    });

    describe('toOpenTelemetryAttributes with logPrompts=true', () => {
      const config = createMockConfig(true);

      it('should include all fields when logPrompts is enabled', () => {
        const event = new HookCallEvent(
          'BeforeTool',
          'command',
          '/path/to/.gemini/hooks/check-secrets.sh --api-key=abc123',
          { tool_name: 'ReadFile', args: { file: 'secret.txt' } },
          100,
          true,
          { decision: 'allow' },
          0,
          'hook executed successfully',
          'no errors',
        );

        const attributes = event.toOpenTelemetryAttributes(config);

        expect(attributes['event.name']).toBe(EVENT_HOOK_CALL);
        expect(attributes['hook_event_name']).toBe('BeforeTool');
        expect(attributes['hook_type']).toBe('command');
        // With logPrompts=true, full hook name is included
        expect(attributes['hook_name']).toBe(
          '/path/to/.gemini/hooks/check-secrets.sh --api-key=abc123',
        );
        expect(attributes['duration_ms']).toBe(100);
        expect(attributes['success']).toBe(true);
        expect(attributes['exit_code']).toBe(0);
        // PII-sensitive fields should be included
        expect(attributes['hook_input']).toBeDefined();
        expect(attributes['hook_output']).toBeDefined();
        expect(attributes['stdout']).toBe('hook executed successfully');
        expect(attributes['stderr']).toBe('no errors');
      });

      it('should include hook_input and hook_output as JSON strings', () => {
        const event = new HookCallEvent(
          'BeforeTool',
          'command',
          'test-hook',
          { tool_name: 'ReadFile', args: { file: 'test.txt' } },
          100,
          true,
          { decision: 'allow', reason: 'approved' },
        );

        const attributes = event.toOpenTelemetryAttributes(config);

        // Should be JSON stringified
        expect(typeof attributes['hook_input']).toBe('string');
        expect(typeof attributes['hook_output']).toBe('string');

        const parsedInput = JSON.parse(attributes['hook_input'] as string);
        expect(parsedInput).toEqual({
          tool_name: 'ReadFile',
          args: { file: 'test.txt' },
        });

        const parsedOutput = JSON.parse(attributes['hook_output'] as string);
        expect(parsedOutput).toEqual({ decision: 'allow', reason: 'approved' });
      });
    });

    describe('toOpenTelemetryAttributes with logPrompts=false', () => {
      const config = createMockConfig(false);

      it('should exclude PII-sensitive fields when logPrompts is disabled', () => {
        const event = new HookCallEvent(
          'BeforeTool',
          'command',
          '/path/to/.gemini/hooks/check-secrets.sh --api-key=abc123',
          { tool_name: 'ReadFile', args: { file: 'secret.txt' } },
          100,
          true,
          { decision: 'allow' },
          0,
          'hook executed successfully',
          'no errors',
        );

        const attributes = event.toOpenTelemetryAttributes(config);

        expect(attributes['event.name']).toBe(EVENT_HOOK_CALL);
        expect(attributes['hook_event_name']).toBe('BeforeTool');
        expect(attributes['hook_type']).toBe('command');
        expect(attributes['duration_ms']).toBe(100);
        expect(attributes['success']).toBe(true);
        expect(attributes['exit_code']).toBe(0);
        // PII-sensitive fields should NOT be included
        expect(attributes['hook_input']).toBeUndefined();
        expect(attributes['hook_output']).toBeUndefined();
        expect(attributes['stdout']).toBeUndefined();
        expect(attributes['stderr']).toBeUndefined();
      });

      it('should sanitize hook_name when logPrompts is disabled', () => {
        const testCases = [
          {
            input: '/path/to/.gemini/hooks/check-secrets.sh --api-key=abc123',
            expected: 'check-secrets.sh',
            description: 'full path with arguments',
          },
          {
            input: 'python /home/user/script.py --token=xyz',
            expected: 'python',
            description: 'command with script path and token',
          },
          {
            input: 'node index.js',
            expected: 'node',
            description: 'simple command with file',
          },
          {
            input: '/usr/bin/bash -c "echo $SECRET"',
            expected: 'bash',
            description: 'path with inline script',
          },
          {
            input: 'C:\\Windows\\System32\\cmd.exe /c secret.bat',
            expected: 'cmd.exe',
            description: 'Windows path with arguments',
          },
          {
            input: './hooks/local-hook.sh',
            expected: 'local-hook.sh',
            description: 'relative path',
          },
          {
            input: 'simple-command',
            expected: 'simple-command',
            description: 'command without path or args',
          },
          {
            input: '',
            expected: 'unknown-command',
            description: 'empty string',
          },
          {
            input: '   ',
            expected: 'unknown-command',
            description: 'whitespace only',
          },
        ];

        for (const testCase of testCases) {
          const event = new HookCallEvent(
            'BeforeTool',
            'command',
            testCase.input,
            { tool_name: 'ReadFile' },
            100,
            true,
          );

          const attributes = event.toOpenTelemetryAttributes(config);

          expect(attributes['hook_name']).toBe(testCase.expected);
        }
      });

      it('should still include error field even when logPrompts is disabled', () => {
        const event = new HookCallEvent(
          'BeforeTool',
          'command',
          'test-hook',
          { tool_name: 'ReadFile' },
          100,
          false,
          undefined,
          undefined,
          undefined,
          undefined,
          'Hook execution failed',
        );

        const attributes = event.toOpenTelemetryAttributes(config);

        // Error should be included for debugging
        expect(attributes['error']).toBe('Hook execution failed');
        // But other PII fields should not
        expect(attributes['hook_input']).toBeUndefined();
        expect(attributes['stdout']).toBeUndefined();
      });
    });

    describe('sanitizeHookName edge cases', () => {
      const config = createMockConfig(false);

      it('should handle commands with multiple spaces', () => {
        const event = new HookCallEvent(
          'BeforeTool',
          'command',
          'python   script.py   --arg1   --arg2',
          {},
          100,
          true,
        );

        const attributes = event.toOpenTelemetryAttributes(config);
        expect(attributes['hook_name']).toBe('python');
      });

      it('should handle mixed path separators', () => {
        const event = new HookCallEvent(
          'BeforeTool',
          'command',
          '/path/to\\mixed\\separators.sh',
          {},
          100,
          true,
        );

        const attributes = event.toOpenTelemetryAttributes(config);
        expect(attributes['hook_name']).toBe('separators.sh');
      });

      it('should handle trailing slashes', () => {
        const event = new HookCallEvent(
          'BeforeTool',
          'command',
          '/path/to/directory/',
          {},
          100,
          true,
        );

        const attributes = event.toOpenTelemetryAttributes(config);
        expect(attributes['hook_name']).toBe('unknown-command');
      });
    });

    describe('toLogBody', () => {
      it('should format success message correctly', () => {
        const event = new HookCallEvent(
          'BeforeTool',
          'command',
          'test-hook',
          {},
          150,
          true,
        );

        expect(event.toLogBody()).toBe(
          'Hook call BeforeTool.test-hook succeeded in 150ms',
        );
      });

      it('should format failure message correctly', () => {
        const event = new HookCallEvent(
          'AfterTool',
          'command',
          'validation-hook',
          {},
          75,
          false,
        );

        expect(event.toLogBody()).toBe(
          'Hook call AfterTool.validation-hook failed in 75ms',
        );
      });
    });

    describe('integration scenarios', () => {
      it('should handle enterprise scenario with full logging', () => {
        const enterpriseConfig = createMockConfig(true);

        const event = new HookCallEvent(
          'BeforeModel',
          'command',
          '$GEMINI_PROJECT_DIR/.gemini/hooks/add-context.sh',
          {
            llm_request: {
              model: 'gemini-1.5-flash',
              messages: [{ role: 'user', content: 'Hello' }],
            },
          },
          250,
          true,
          {
            hookSpecificOutput: {
              llm_request: {
                messages: [
                  { role: 'user', content: 'Hello' },
                  { role: 'system', content: 'Additional context...' },
                ],
              },
            },
          },
          0,
          'Context added successfully',
        );

        const attributes = event.toOpenTelemetryAttributes(enterpriseConfig);

        // In enterprise mode, everything is logged
        expect(attributes['hook_name']).toBe(
          '$GEMINI_PROJECT_DIR/.gemini/hooks/add-context.sh',
        );
        expect(attributes['hook_input']).toBeDefined();
        expect(attributes['hook_output']).toBeDefined();
        expect(attributes['stdout']).toBe('Context added successfully');
      });

      it('should handle public telemetry scenario with minimal logging', () => {
        const publicConfig = createMockConfig(false);

        const event = new HookCallEvent(
          'BeforeModel',
          'command',
          '$GEMINI_PROJECT_DIR/.gemini/hooks/add-context.sh',
          {
            llm_request: {
              model: 'gemini-1.5-flash',
              messages: [{ role: 'user', content: 'Hello' }],
            },
          },
          250,
          true,
          {
            hookSpecificOutput: {
              llm_request: {
                messages: [
                  { role: 'user', content: 'Hello' },
                  { role: 'system', content: 'Additional context...' },
                ],
              },
            },
          },
          0,
          'Context added successfully',
        );

        const attributes = event.toOpenTelemetryAttributes(publicConfig);

        // In public mode, only metadata
        expect(attributes['hook_name']).toBe('add-context.sh');
        expect(attributes['hook_input']).toBeUndefined();
        expect(attributes['hook_output']).toBeUndefined();
        expect(attributes['stdout']).toBeUndefined();
        // But metadata is still there
        expect(attributes['hook_event_name']).toBe('BeforeModel');
        expect(attributes['duration_ms']).toBe(250);
        expect(attributes['success']).toBe(true);
      });
    });

    describe('real-world sensitive command examples', () => {
      const config = createMockConfig(false);

      it('should sanitize commands with API keys', () => {
        const event = new HookCallEvent(
          'BeforeTool',
          'command',
          'curl https://api.example.com -H "Authorization: Bearer sk-abc123xyz"',
          {},
          100,
          true,
        );

        const attributes = event.toOpenTelemetryAttributes(config);
        expect(attributes['hook_name']).toBe('curl');
      });

      it('should sanitize commands with database credentials', () => {
        const event = new HookCallEvent(
          'BeforeTool',
          'command',
          'psql postgresql://user:password@localhost/db',
          {},
          100,
          true,
        );

        const attributes = event.toOpenTelemetryAttributes(config);
        expect(attributes['hook_name']).toBe('psql');
      });

      it('should sanitize commands with environment variables containing secrets', () => {
        const event = new HookCallEvent(
          'BeforeTool',
          'command',
          'AWS_SECRET_KEY=abc123 aws s3 ls',
          {},
          100,
          true,
        );

        const attributes = event.toOpenTelemetryAttributes(config);
        expect(attributes['hook_name']).toBe('AWS_SECRET_KEY=abc123');
      });

      it('should sanitize Python scripts with file paths', () => {
        const event = new HookCallEvent(
          'BeforeTool',
          'command',
          'python /home/john.doe/projects/secret-scanner/scan.py --config=/etc/secrets.yml',
          {},
          100,
          true,
        );

        const attributes = event.toOpenTelemetryAttributes(config);
        expect(attributes['hook_name']).toBe('python');
      });
    });
  });
});
