/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runNonInteractive } from './nonInteractiveCli.js';
import { Config } from '@google/gemini-cli-core';
import { existsSync, unlinkSync } from 'fs';

// Mock console methods to capture output
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
const mockStdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

describe('Non-Interactive CLI with Enhanced Retry', () => {
  let mockConfig: Config;
  const debugLogPath = '.gemini-cli-debug.log';
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    // Clean up any existing debug log
    if (existsSync(debugLogPath)) {
      unlinkSync(debugLogPath);
    }
    
    process.exitCode = 0; // Reset exit code
    
    // Create mock config
    mockConfig = {
      getDebugMode: vi.fn().mockReturnValue(false),
      getMaxSessionTurns: vi.fn().mockReturnValue(10),
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: 'LOGIN_WITH_GOOGLE'
      }),
      getGeminiClient: vi.fn().mockReturnValue({
        sendMessageStream: vi.fn()
      }),
      getToolRegistry: vi.fn().mockResolvedValue({})
    } as any;
  });

  afterEach(() => {
    // Clean up debug log after each test
    if (existsSync(debugLogPath)) {
      unlinkSync(debugLogPath);
    }
    
    process.exitCode = originalExitCode; // Restore
    vi.clearAllMocks();
  });

  describe('successful requests', () => {
    it('should handle successful API calls without retry', async () => {
      const mockStreamResponse = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'content', value: 'Hello, world!' };
        }
      };
      
      mockConfig.getGeminiClient = vi.fn().mockReturnValue({
        sendMessageStream: vi.fn().mockResolvedValue(mockStreamResponse)
      });

      await runNonInteractive(mockConfig, 'Hello', 'test-prompt-id');

      expect(mockStdoutWrite).toHaveBeenCalledWith('Hello, world!');
      expect(mockStdoutWrite).toHaveBeenCalledWith('\n'); // Final newline
    });
  });

  describe('retry scenarios', () => {
    it('should retry on 429 errors and eventually succeed', async () => {
      let callCount = 0;
      const mockSendMessageStream = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          // First two calls fail with 429
          throw { status: 429, message: 'Too Many Requests' };
        }
        // Third call succeeds
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'content', value: 'Success after retry!' };
          }
        };
      });

      mockConfig.getGeminiClient = vi.fn().mockReturnValue({
        sendMessageStream: mockSendMessageStream
      });

      await runNonInteractive(mockConfig, 'Test retry', 'test-prompt-id');

      expect(mockSendMessageStream).toHaveBeenCalledTimes(3);
      expect(mockStdoutWrite).toHaveBeenCalledWith('Success after retry!');
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('NON_INTERACTIVE_CHAT failed, retrying in')
      );
    });

    it('should retry on 500 errors and eventually succeed', async () => {
      let callCount = 0;
      const mockSendMessageStream = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw { status: 500, message: 'Internal Server Error' };
        }
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'content', value: 'Recovered from server error!' };
          }
        };
      });

      mockConfig.getGeminiClient = vi.fn().mockReturnValue({
        sendMessageStream: mockSendMessageStream
      });

      await runNonInteractive(mockConfig, 'Test server error', 'test-prompt-id');

      expect(mockSendMessageStream).toHaveBeenCalledTimes(2);
      expect(mockStdoutWrite).toHaveBeenCalledWith('Recovered from server error!');
    });

    it('should handle network errors with retry', async () => {
      let callCount = 0;
      const mockSendMessageStream = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw { code: 'ECONNRESET', message: 'Connection reset by peer' };
        }
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'content', value: 'Network recovered!' };
          }
        };
      });

      mockConfig.getGeminiClient = vi.fn().mockReturnValue({
        sendMessageStream: mockSendMessageStream
      });

      await runNonInteractive(mockConfig, 'Test network error', 'test-prompt-id');

      expect(mockSendMessageStream).toHaveBeenCalledTimes(2);
      expect(mockStdoutWrite).toHaveBeenCalledWith('Network recovered!');
    });
  });

  describe('failure scenarios', () => {
    it('should fail gracefully after max retries exhausted', async () => {
      const mockSendMessageStream = vi.fn().mockRejectedValue({
        status: 429,
        message: 'Too Many Requests'
      });

      mockConfig.getGeminiClient = vi.fn().mockReturnValue({
        sendMessageStream: mockSendMessageStream
      });

      await expect(runNonInteractive(mockConfig, 'Test max retries', 'test-prompt-id'))
        .rejects.toThrow();

      expect(mockSendMessageStream).toHaveBeenCalledTimes(6); // Initial + 5 retries
      expect(process.exitCode).toBe(1);
    });

    it('should not retry on 400 errors', async () => {
      const mockSendMessageStream = vi.fn().mockRejectedValue({
        status: 400,
        message: 'Bad Request'
      });

      mockConfig.getGeminiClient = vi.fn().mockReturnValue({
        sendMessageStream: mockSendMessageStream
      });

      await expect(runNonInteractive(mockConfig, 'Test bad request', 'test-prompt-id'))
        .rejects.toThrow();

      expect(mockSendMessageStream).toHaveBeenCalledTimes(1); // No retries
      expect(process.exitCode).toBe(1);
    });
  });

  describe('debug logging', () => {
    it('should create debug log for retry attempts', async () => {
      let callCount = 0;
      const mockSendMessageStream = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw { status: 429, message: 'Too Many Requests' };
        }
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'content', value: 'Success!' };
          }
        };
      });

      mockConfig.getGeminiClient = vi.fn().mockReturnValue({
        sendMessageStream: mockSendMessageStream
      });

      await runNonInteractive(mockConfig, 'Test debug logging', 'test-prompt-id');

      expect(existsSync(debugLogPath)).toBe(true);
    });
  });

  describe('tool execution with retry', () => {
    it('should retry tool execution on network errors', async () => {
      const mockStreamResponse = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'tool_call_request',
            value: {
              name: 'test_tool',
              args: { param: 'value' },
              callId: 'test-call-id'
            }
          };
        }
      };

      let toolCallCount = 0;
      const mockExecuteToolCall = vi.fn().mockImplementation(() => {
        toolCallCount++;
        if (toolCallCount === 1) {
          throw { code: 'ETIMEDOUT', message: 'Request timeout' };
        }
        return {
          responseParts: [{ text: 'Tool executed successfully!' }],
          error: null
        };
      });

      mockConfig.getGeminiClient = vi.fn().mockReturnValue({
        sendMessageStream: vi.fn().mockResolvedValue(mockStreamResponse)
      });

      // Mock the executeToolCall function
      vi.doMock('@google/gemini-cli-core', async () => {
        const actual = await vi.importActual('@google/gemini-cli-core');
        return {
          ...actual,
          executeToolCall: mockExecuteToolCall
        };
      });

      await runNonInteractive(mockConfig, 'Test tool retry', 'test-prompt-id');

      expect(mockExecuteToolCall).toHaveBeenCalledTimes(2);
    });
  });

  describe('progress indicators', () => {
    it('should show progress in non-TTY environment', async () => {
      // Mock non-TTY environment
      const originalIsTTY = process.stderr.isTTY;
      process.stderr.isTTY = false;

      const mockSendMessageStream = vi.fn()
        .mockRejectedValueOnce({ status: 429, message: 'Too Many Requests' })
        .mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            yield { type: 'content', value: 'Success!' };
          }
        });

      mockConfig.getGeminiClient = vi.fn().mockReturnValue({
        sendMessageStream: mockSendMessageStream
      });

      await runNonInteractive(mockConfig, 'Test progress', 'test-prompt-id');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('[*] CHAT_TURN_1 failed, retrying in')
      );

      process.stderr.isTTY = originalIsTTY; // Restore
    });
  });

  describe('session turn limits', () => {
    it('should respect max session turns', async () => {
      mockConfig.getMaxSessionTurns = vi.fn().mockReturnValue(1);

      const mockStreamResponse = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'tool_call_request',
            value: {
              name: 'test_tool',
              args: {},
              callId: 'test-call-id'
            }
          };
        }
      };

      mockConfig.getGeminiClient = vi.fn().mockReturnValue({
        sendMessageStream: vi.fn().mockResolvedValue(mockStreamResponse)
      });

      // Mock executeToolCall to return a response that would trigger another turn
      vi.doMock('@google/gemini-cli-core', async () => {
        const actual = await vi.importActual('@google/gemini-cli-core');
        return {
          ...actual,
          executeToolCall: vi.fn().mockResolvedValue({
            responseParts: [{ text: 'Tool response' }],
            error: null
          })
        };
      });

      await runNonInteractive(mockConfig, 'Test turn limit', 'test-prompt-id');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Reached max session turns')
      );
    });
  });
});
