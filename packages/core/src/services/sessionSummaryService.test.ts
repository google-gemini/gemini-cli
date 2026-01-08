/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionSummaryService } from './sessionSummaryService.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type { MessageRecord } from './chatRecordingService.js';
import type { GenerateContentResponse } from '@google/genai';

describe('SessionSummaryService', () => {
  let service: SessionSummaryService;
  let mockBaseLlmClient: BaseLlmClient;
  let mockGenerateContent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup mock BaseLlmClient with generateContent
    mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'Add dark mode to the app' }],
          },
        },
      ],
    } as unknown as GenerateContentResponse);

    mockBaseLlmClient = {
      generateContent: mockGenerateContent,
    } as unknown as BaseLlmClient;

    service = new SessionSummaryService(mockBaseLlmClient);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should generate summary for valid conversation', async () => {
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'How do I add dark mode to my app?' }],
        },
        {
          id: '2',
          timestamp: '2025-12-03T00:01:00Z',
          type: 'gemini',
          content: [
            {
              text: 'To add dark mode, you need to create a theme provider and toggle state...',
            },
          ],
        },
      ];

      const summary = await service.generateSummary({ messages });

      expect(summary).toBe('Add dark mode to the app');
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          modelConfigKey: { model: 'summarizer-default' },
          contents: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              parts: expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining('User: How do I add dark mode'),
                }),
              ]),
            }),
          ]),
          promptId: 'session-summary-generation',
        }),
      );
    });

    it('should return null for empty messages array', async () => {
      const summary = await service.generateSummary({ messages: [] });

      expect(summary).toBeNull();
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should return null when all messages have empty content', async () => {
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: '   ' }],
        },
        {
          id: '2',
          timestamp: '2025-12-03T00:01:00Z',
          type: 'gemini',
          content: [{ text: '' }],
        },
      ];

      const summary = await service.generateSummary({ messages });

      expect(summary).toBeNull();
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should handle maxMessages limit correctly', async () => {
      const messages: MessageRecord[] = Array.from({ length: 30 }, (_, i) => ({
        id: `${i}`,
        timestamp: '2025-12-03T00:00:00Z',
        type: i % 2 === 0 ? ('user' as const) : ('gemini' as const),
        content: [{ text: `Message ${i}` }],
      }));

      await service.generateSummary({ messages, maxMessages: 10 });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      // Count how many messages appear in the prompt (should be 10)
      const messageCount = (promptText.match(/Message \d+/g) || []).length;
      expect(messageCount).toBe(10);
    });
  });

  describe('Message Type Filtering', () => {
    it('should include only user and gemini messages', async () => {
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'User message' }],
        },
        {
          id: '2',
          timestamp: '2025-12-03T00:01:00Z',
          type: 'gemini',
          content: [{ text: 'Gemini response' }],
        },
      ];

      await service.generateSummary({ messages });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      expect(promptText).toContain('User: User message');
      expect(promptText).toContain('Assistant: Gemini response');
    });

    it('should exclude info messages', async () => {
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'User message' }],
        },
        {
          id: '2',
          timestamp: '2025-12-03T00:01:00Z',
          type: 'info',
          content: [{ text: 'Info message should be excluded' }],
        },
        {
          id: '3',
          timestamp: '2025-12-03T00:02:00Z',
          type: 'gemini',
          content: [{ text: 'Gemini response' }],
        },
      ];

      await service.generateSummary({ messages });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      expect(promptText).toContain('User: User message');
      expect(promptText).toContain('Assistant: Gemini response');
      expect(promptText).not.toContain('Info message');
    });

    it('should exclude error messages', async () => {
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'User message' }],
        },
        {
          id: '2',
          timestamp: '2025-12-03T00:01:00Z',
          type: 'error',
          content: [{ text: 'Error: something went wrong' }],
        },
        {
          id: '3',
          timestamp: '2025-12-03T00:02:00Z',
          type: 'gemini',
          content: [{ text: 'Gemini response' }],
        },
      ];

      await service.generateSummary({ messages });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      expect(promptText).not.toContain('Error: something went wrong');
    });

    it('should exclude warning messages', async () => {
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'User message' }],
        },
        {
          id: '2',
          timestamp: '2025-12-03T00:01:00Z',
          type: 'warning',
          content: [{ text: 'Warning: deprecated API' }],
        },
        {
          id: '3',
          timestamp: '2025-12-03T00:02:00Z',
          type: 'gemini',
          content: [{ text: 'Gemini response' }],
        },
      ];

      await service.generateSummary({ messages });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      expect(promptText).not.toContain('Warning: deprecated API');
    });

    it('should handle mixed message types correctly', async () => {
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'info',
          content: [{ text: 'System info' }],
        },
        {
          id: '2',
          timestamp: '2025-12-03T00:01:00Z',
          type: 'user',
          content: [{ text: 'User question' }],
        },
        {
          id: '3',
          timestamp: '2025-12-03T00:02:00Z',
          type: 'error',
          content: [{ text: 'Error occurred' }],
        },
        {
          id: '4',
          timestamp: '2025-12-03T00:03:00Z',
          type: 'gemini',
          content: [{ text: 'Gemini answer' }],
        },
        {
          id: '5',
          timestamp: '2025-12-03T00:04:00Z',
          type: 'warning',
          content: [{ text: 'Warning message' }],
        },
      ];

      await service.generateSummary({ messages });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      expect(promptText).toContain('User: User question');
      expect(promptText).toContain('Assistant: Gemini answer');
      expect(promptText).not.toContain('System info');
      expect(promptText).not.toContain('Error occurred');
      expect(promptText).not.toContain('Warning message');
    });

    it('should return null when only system messages present', async () => {
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'info',
          content: [{ text: 'Info message' }],
        },
        {
          id: '2',
          timestamp: '2025-12-03T00:01:00Z',
          type: 'error',
          content: [{ text: 'Error message' }],
        },
        {
          id: '3',
          timestamp: '2025-12-03T00:02:00Z',
          type: 'warning',
          content: [{ text: 'Warning message' }],
        },
      ];

      const summary = await service.generateSummary({ messages });

      expect(summary).toBeNull();
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });
  });

  describe('Timeout and Abort Handling', () => {
    it('should timeout after specified duration', async () => {
      // Mock implementation that respects abort signal
      mockGenerateContent.mockImplementation(
        ({ abortSignal }) =>
          new Promise((resolve, reject) => {
            const timeoutId = setTimeout(
              () =>
                resolve({
                  candidates: [{ content: { parts: [{ text: 'Summary' }] } }],
                }),
              10000,
            );

            abortSignal?.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              const abortError = new Error('This operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          }),
      );

      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'Hello' }],
        },
      ];

      const summaryPromise = service.generateSummary({
        messages,
        timeout: 100,
      });

      // Advance timers past the timeout to trigger abort
      await vi.advanceTimersByTimeAsync(100);

      const summary = await summaryPromise;

      expect(summary).toBeNull();
    });

    it('should detect AbortError by name only (not message)', async () => {
      const abortError = new Error('Different abort message');
      abortError.name = 'AbortError';
      mockGenerateContent.mockRejectedValue(abortError);

      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'Hello' }],
        },
      ];

      const summary = await service.generateSummary({ messages });

      expect(summary).toBeNull();
      // Should handle it gracefully without throwing
    });

    it('should handle API errors gracefully', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API Error'));

      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'Hello' }],
        },
      ];

      const summary = await service.generateSummary({ messages });

      expect(summary).toBeNull();
    });

    it('should handle empty response from LLM', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse);

      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'Hello' }],
        },
      ];

      const summary = await service.generateSummary({ messages });

      expect(summary).toBeNull();
    });
  });

  describe('Text Processing', () => {
    it('should clean newlines and extra whitespace', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Add dark mode\n\nto   the   app',
                },
              ],
            },
          },
        ],
      } as unknown as GenerateContentResponse);

      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'Hello' }],
        },
      ];

      const summary = await service.generateSummary({ messages });

      expect(summary).toBe('Add dark mode to the app');
    });

    it('should remove surrounding quotes', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '"Add dark mode to the app"' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse);

      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'Hello' }],
        },
      ];

      const summary = await service.generateSummary({ messages });

      expect(summary).toBe('Add dark mode to the app');
    });

    it('should handle messages longer than 500 chars', async () => {
      const longMessage = 'a'.repeat(1000);
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: longMessage }],
        },
        {
          id: '2',
          timestamp: '2025-12-03T00:01:00Z',
          type: 'gemini',
          content: [{ text: 'Response' }],
        },
      ];

      await service.generateSummary({ messages });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      // Should be truncated to ~500 chars + "..."
      expect(promptText).toContain('...');
      expect(promptText).not.toContain('a'.repeat(600));
    });

    it('should preserve important content in truncation', async () => {
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'How do I add dark mode?' }],
        },
        {
          id: '2',
          timestamp: '2025-12-03T00:01:00Z',
          type: 'gemini',
          content: [
            {
              text: 'Here is a detailed explanation...',
            },
          ],
        },
      ];

      await service.generateSummary({ messages });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      // User question should be preserved
      expect(promptText).toContain('User: How do I add dark mode?');
      expect(promptText).toContain('Assistant: Here is a detailed explanation');
    });
  });

  describe('Sliding Window Message Selection', () => {
    it('should return all messages when fewer than 20 exist', async () => {
      const messages = Array.from({ length: 5 }, (_, i) => ({
        id: `${i}`,
        timestamp: '2025-12-03T00:00:00Z',
        type: i % 2 === 0 ? ('user' as const) : ('gemini' as const),
        content: [{ text: `Message ${i}` }],
      }));

      await service.generateSummary({ messages });

      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      const messageCount = (promptText.match(/Message \d+/g) || []).length;
      expect(messageCount).toBe(5);
    });

    it('should select first 10 + last 10 from 50 messages', async () => {
      const messages = Array.from({ length: 50 }, (_, i) => ({
        id: `${i}`,
        timestamp: '2025-12-03T00:00:00Z',
        type: i % 2 === 0 ? ('user' as const) : ('gemini' as const),
        content: [{ text: `Message ${i}` }],
      }));

      await service.generateSummary({ messages });

      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      // Should include first 10
      expect(promptText).toContain('Message 0');
      expect(promptText).toContain('Message 9');

      // Should skip middle
      expect(promptText).not.toContain('Message 25');

      // Should include last 10
      expect(promptText).toContain('Message 40');
      expect(promptText).toContain('Message 49');

      const messageCount = (promptText.match(/Message \d+/g) || []).length;
      expect(messageCount).toBe(20);
    });

    it('should return all messages when exactly 20 exist', async () => {
      const messages = Array.from({ length: 20 }, (_, i) => ({
        id: `${i}`,
        timestamp: '2025-12-03T00:00:00Z',
        type: i % 2 === 0 ? ('user' as const) : ('gemini' as const),
        content: [{ text: `Message ${i}` }],
      }));

      await service.generateSummary({ messages });

      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      const messageCount = (promptText.match(/Message \d+/g) || []).length;
      expect(messageCount).toBe(20);
    });

    it('should preserve message ordering in sliding window', async () => {
      const messages = Array.from({ length: 30 }, (_, i) => ({
        id: `${i}`,
        timestamp: '2025-12-03T00:00:00Z',
        type: i % 2 === 0 ? ('user' as const) : ('gemini' as const),
        content: [{ text: `Message ${i}` }],
      }));

      await service.generateSummary({ messages });

      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      const matches = promptText.match(/Message (\d+)/g) || [];
      const indices = matches.map((m: string) => parseInt(m.split(' ')[1], 10));

      // Verify ordering is preserved
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThan(indices[i - 1]);
      }
    });

    it('should not count system messages when calculating window', async () => {
      const messages: MessageRecord[] = [
        // First 10 user/gemini messages
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `${i}`,
          timestamp: '2025-12-03T00:00:00Z',
          type: i % 2 === 0 ? ('user' as const) : ('gemini' as const),
          content: [{ text: `Message ${i}` }],
        })),
        // System messages (should be filtered out)
        {
          id: 'info1',
          timestamp: '2025-12-03T00:10:00Z',
          type: 'info' as const,
          content: [{ text: 'Info' }],
        },
        {
          id: 'warn1',
          timestamp: '2025-12-03T00:11:00Z',
          type: 'warning' as const,
          content: [{ text: 'Warning' }],
        },
        // Last 40 user/gemini messages
        ...Array.from({ length: 40 }, (_, i) => ({
          id: `${i + 10}`,
          timestamp: '2025-12-03T00:12:00Z',
          type: i % 2 === 0 ? ('user' as const) : ('gemini' as const),
          content: [{ text: `Message ${i + 10}` }],
        })),
      ];

      await service.generateSummary({ messages });

      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      // Should include early messages
      expect(promptText).toContain('Message 0');
      expect(promptText).toContain('Message 9');

      // Should include late messages
      expect(promptText).toContain('Message 40');
      expect(promptText).toContain('Message 49');

      // Should not include system messages
      expect(promptText).not.toContain('Info');
      expect(promptText).not.toContain('Warning');
    });
  });

  describe('Edge Cases', () => {
    it('should handle conversation with only user messages', async () => {
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'First question' }],
        },
        {
          id: '2',
          timestamp: '2025-12-03T00:01:00Z',
          type: 'user',
          content: [{ text: 'Second question' }],
        },
      ];

      const summary = await service.generateSummary({ messages });

      expect(summary).not.toBeNull();
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('should handle conversation with only gemini messages', async () => {
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'gemini',
          content: [{ text: 'First response' }],
        },
        {
          id: '2',
          timestamp: '2025-12-03T00:01:00Z',
          type: 'gemini',
          content: [{ text: 'Second response' }],
        },
      ];

      const summary = await service.generateSummary({ messages });

      expect(summary).not.toBeNull();
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('should handle very long individual messages (>500 chars)', async () => {
      const longMessage =
        `This is a very long message that contains a lot of text and definitely exceeds the 500 character limit. `.repeat(
          10,
        );
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: longMessage }],
        },
      ];

      await service.generateSummary({ messages });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateContent.mock.calls[0][0];
      const promptText = callArgs.contents[0].parts[0].text;

      // Should contain the truncation marker
      expect(promptText).toContain('...');
    });

    it('should handle messages with special characters', async () => {
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [
            {
              text: 'How to use <Component> with props={value} & state?',
            },
          ],
        },
      ];

      const summary = await service.generateSummary({ messages });

      expect(summary).not.toBeNull();
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('should handle malformed message content', async () => {
      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [], // Empty parts array
        },
        {
          id: '2',
          timestamp: '2025-12-03T00:01:00Z',
          type: 'gemini',
          content: [{ text: 'Valid response' }],
        },
      ];

      await service.generateSummary({ messages });

      // Should handle gracefully and still process valid messages
      expect(mockGenerateContent).toHaveBeenCalled();
    });
  });

  describe('Internationalization Support', () => {
    it('should preserve international characters (Chinese)', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '添加深色模式到应用' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse);

      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'How do I add dark mode?' }],
        },
      ];

      const summary = await service.generateSummary({ messages });

      expect(summary).toBe('添加深色模式到应用');
    });

    it('should preserve international characters (Arabic)', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: 'إضافة الوضع الداكن' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse);

      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'How do I add dark mode?' }],
        },
      ];

      const summary = await service.generateSummary({ messages });

      expect(summary).toBe('إضافة الوضع الداكن');
    });

    it('should preserve accented characters', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: 'Añadir modo oscuro à la aplicación' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse);

      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'How do I add dark mode?' }],
        },
      ];

      const summary = await service.generateSummary({ messages });

      expect(summary).toBe('Añadir modo oscuro à la aplicación');
    });

    it('should preserve emojis in summaries', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: '🌙 Add dark mode 🎨 to the app ✨' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse);

      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'How do I add dark mode?' }],
        },
      ];

      const summary = await service.generateSummary({ messages });

      // Emojis are preserved
      expect(summary).toBe('🌙 Add dark mode 🎨 to the app ✨');
      expect(summary).toContain('🌙');
      expect(summary).toContain('🎨');
      expect(summary).toContain('✨');
    });

    it('should preserve zero-width characters for language rendering', async () => {
      // Arabic with Zero-Width Joiner (ZWJ) for proper ligatures
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [{ text: 'كلمة\u200Dمتصلة' }], // Contains ZWJ
            },
          },
        ],
      } as unknown as GenerateContentResponse);

      const messages: MessageRecord[] = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user',
          content: [{ text: 'Test' }],
        },
      ];

      const summary = await service.generateSummary({ messages });

      // ZWJ is preserved (it's not considered whitespace)
      expect(summary).toBe('كلمة\u200Dمتصلة');
      expect(summary).toContain('\u200D'); // ZWJ should be preserved
    });
  });
});
