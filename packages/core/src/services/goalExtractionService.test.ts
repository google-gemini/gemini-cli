/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoalExtractionService } from './goalExtractionService.js';
import type { Content, GenerateContentResponse } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';

describe('GoalExtractionService', () => {
  let service: GoalExtractionService;
  let mockContentGenerator: ContentGenerator;

  beforeEach(() => {
    mockContentGenerator = {
      generateContent: vi.fn(),
    } as unknown as ContentGenerator;

    service = new GoalExtractionService();
  });

  it('should extract single goal from conversation history', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'Help me add user authentication' }] },
      {
        role: 'model',
        parts: [{ text: "I'll help you implement authentication" }],
      },
      {
        role: 'user',
        parts: [{ text: 'We need OAuth and JWT support' }],
      },
    ];

    const mockResponse: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '<goals><goal>Implementing user authentication with OAuth and JWT</goal></goals>',
              },
            ],
          },
        },
      ],
    } as GenerateContentResponse;

    vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
      mockResponse,
    );

    const result = await service.extractGoals(
      history,
      mockContentGenerator,
      'gemini-pro',
      'test-prompt-id',
    );

    expect(result.goals).toHaveLength(1);
    expect(result.goals[0]).toBe(
      'Implementing user authentication with OAuth and JWT',
    );
    expect(result.confidence).toBe('high');
  });

  it('should extract multiple goals from conversation', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'I need to refactor the API' }] },
      { role: 'model', parts: [{ text: 'What needs refactoring?' }] },
      {
        role: 'user',
        parts: [{ text: 'The error handling and rate limiting' }],
      },
    ];

    const mockResponse: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '<goals><goal>Refactoring API error handling</goal><goal>Implementing rate limiting</goal></goals>',
              },
            ],
          },
        },
      ],
    } as GenerateContentResponse;

    vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
      mockResponse,
    );

    const result = await service.extractGoals(
      history,
      mockContentGenerator,
      'gemini-pro',
      'test-prompt-id',
    );

    expect(result.goals).toHaveLength(2);
    expect(result.goals[0]).toBe('Refactoring API error handling');
    expect(result.goals[1]).toBe('Implementing rate limiting');
  });

  it('should return empty array when no clear goal found', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi! How can I help?' }] },
    ];

    const mockResponse: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '<goals></goals>',
              },
            ],
          },
        },
      ],
    } as GenerateContentResponse;

    vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
      mockResponse,
    );

    const result = await service.extractGoals(
      history,
      mockContentGenerator,
      'gemini-pro',
      'test-prompt-id',
    );

    expect(result.goals).toHaveLength(0);
    expect(result.confidence).toBe('none');
  });

  it('should handle timeout gracefully', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'Add dark mode' }] },
    ];

    vi.mocked(mockContentGenerator.generateContent).mockRejectedValue(
      new Error('Timeout'),
    );

    const result = await service.extractGoals(
      history,
      mockContentGenerator,
      'gemini-pro',
      'test-prompt-id',
      { timeoutMs: 5000 },
    );

    expect(result.goals).toHaveLength(0);
    expect(result.confidence).toBe('none');
    expect(result.error).toBe('timeout');
  });

  it('should limit history to recent messages', async () => {
    const history: Content[] = Array.from({ length: 100 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('model' as const),
      parts: [{ text: `Message ${i}` }],
    }));

    const mockResponse: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '<goals><goal>Working on something</goal></goals>',
              },
            ],
          },
        },
      ],
    } as GenerateContentResponse;

    vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
      mockResponse,
    );

    await service.extractGoals(
      history,
      mockContentGenerator,
      'gemini-pro',
      'test-prompt-id',
      { maxMessages: 20 },
    );

    expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.arrayContaining([
          expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining(
                  'analyze the recent conversation',
                ),
              }),
            ]),
          }),
        ]),
      }),
      'test-prompt-id',
    );

    // Check that only last 20 messages were included
    const call = vi.mocked(mockContentGenerator.generateContent).mock
      .calls[0][0];
    const historyParts = (call.contents as Content[]).slice(0, -1); // Exclude the prompt
    expect(historyParts.length).toBeLessThanOrEqual(20);
  });
});
