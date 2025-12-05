/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateAndSaveSummary } from './sessionSummaryUtils.js';
import type { Config } from '../config/config.js';
import type { ChatRecordingService } from './chatRecordingService.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { GeminiClient } from '../core/client.js';

// Mock the SessionSummaryService module
vi.mock('./sessionSummaryService.js', () => ({
  SessionSummaryService: vi.fn().mockImplementation(() => ({
    generateSummary: vi.fn(),
  })),
}));

// Mock the BaseLlmClient module
vi.mock('../core/baseLlmClient.js', () => ({
  BaseLlmClient: vi.fn(),
}));

describe('sessionSummaryUtils', () => {
  let mockConfig: Config;
  let mockChatRecordingService: ChatRecordingService;
  let mockGeminiClient: GeminiClient;
  let mockContentGenerator: ContentGenerator;
  let mockGenerateSummary: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock content generator
    mockContentGenerator = {} as ContentGenerator;

    // Setup mock chat recording service
    mockChatRecordingService = {
      getConversation: vi.fn(),
      saveSummary: vi.fn(),
    } as unknown as ChatRecordingService;

    // Setup mock gemini client
    mockGeminiClient = {
      getChatRecordingService: vi
        .fn()
        .mockReturnValue(mockChatRecordingService),
    } as unknown as GeminiClient;

    // Setup mock config
    mockConfig = {
      getContentGenerator: vi.fn().mockReturnValue(mockContentGenerator),
      getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
    } as unknown as Config;

    // Setup mock generateSummary function
    mockGenerateSummary = vi.fn().mockResolvedValue('Add dark mode to the app');

    // Import the mocked module to access the constructor
    const { SessionSummaryService } = await import(
      './sessionSummaryService.js'
    );
    (
      SessionSummaryService as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(() => ({
      generateSummary: mockGenerateSummary,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Integration Tests', () => {
    it('should generate and save summary successfully', async () => {
      const mockConversation = {
        sessionId: 'test-session',
        projectHash: 'test-hash',
        startTime: '2025-12-03T00:00:00Z',
        lastUpdated: '2025-12-03T00:10:00Z',
        messages: [
          {
            id: '1',
            timestamp: '2025-12-03T00:00:00Z',
            type: 'user' as const,
            content: [{ text: 'How do I add dark mode?' }],
          },
          {
            id: '2',
            timestamp: '2025-12-03T00:01:00Z',
            type: 'gemini' as const,
            content: [{ text: 'To add dark mode...' }],
          },
        ],
      };

      (
        mockChatRecordingService.getConversation as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockConversation);

      await generateAndSaveSummary(mockConfig);

      expect(mockChatRecordingService.getConversation).toHaveBeenCalledTimes(1);
      expect(mockGenerateSummary).toHaveBeenCalledTimes(1);
      expect(mockGenerateSummary).toHaveBeenCalledWith({
        messages: mockConversation.messages,
      });
      expect(mockChatRecordingService.saveSummary).toHaveBeenCalledTimes(1);
      expect(mockChatRecordingService.saveSummary).toHaveBeenCalledWith(
        'Add dark mode to the app',
      );
    });

    it('should skip if no chat recording service is available', async () => {
      (
        mockGeminiClient.getChatRecordingService as ReturnType<typeof vi.fn>
      ).mockReturnValue(undefined);

      await generateAndSaveSummary(mockConfig);

      expect(mockGeminiClient.getChatRecordingService).toHaveBeenCalledTimes(1);
      expect(mockGenerateSummary).not.toHaveBeenCalled();
      expect(mockChatRecordingService.saveSummary).not.toHaveBeenCalled();
    });

    it('should skip if no conversation exists', async () => {
      (
        mockChatRecordingService.getConversation as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);

      await generateAndSaveSummary(mockConfig);

      expect(mockChatRecordingService.getConversation).toHaveBeenCalledTimes(1);
      expect(mockGenerateSummary).not.toHaveBeenCalled();
      expect(mockChatRecordingService.saveSummary).not.toHaveBeenCalled();
    });

    it('should skip if summary already exists', async () => {
      const mockConversation = {
        sessionId: 'test-session',
        projectHash: 'test-hash',
        startTime: '2025-12-03T00:00:00Z',
        lastUpdated: '2025-12-03T00:10:00Z',
        summary: 'Existing summary',
        messages: [
          {
            id: '1',
            timestamp: '2025-12-03T00:00:00Z',
            type: 'user' as const,
            content: [{ text: 'Hello' }],
          },
        ],
      };

      (
        mockChatRecordingService.getConversation as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockConversation);

      await generateAndSaveSummary(mockConfig);

      expect(mockChatRecordingService.getConversation).toHaveBeenCalledTimes(1);
      expect(mockGenerateSummary).not.toHaveBeenCalled();
      expect(mockChatRecordingService.saveSummary).not.toHaveBeenCalled();
    });

    it('should skip if no messages present', async () => {
      const mockConversation = {
        sessionId: 'test-session',
        projectHash: 'test-hash',
        startTime: '2025-12-03T00:00:00Z',
        lastUpdated: '2025-12-03T00:10:00Z',
        messages: [],
      };

      (
        mockChatRecordingService.getConversation as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockConversation);

      await generateAndSaveSummary(mockConfig);

      expect(mockChatRecordingService.getConversation).toHaveBeenCalledTimes(1);
      expect(mockGenerateSummary).not.toHaveBeenCalled();
      expect(mockChatRecordingService.saveSummary).not.toHaveBeenCalled();
    });

    it('should handle generateSummary failure gracefully', async () => {
      const mockConversation = {
        sessionId: 'test-session',
        projectHash: 'test-hash',
        startTime: '2025-12-03T00:00:00Z',
        lastUpdated: '2025-12-03T00:10:00Z',
        messages: [
          {
            id: '1',
            timestamp: '2025-12-03T00:00:00Z',
            type: 'user' as const,
            content: [{ text: 'Hello' }],
          },
        ],
      };

      (
        mockChatRecordingService.getConversation as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockConversation);
      mockGenerateSummary.mockResolvedValue(null);

      await generateAndSaveSummary(mockConfig);

      expect(mockChatRecordingService.getConversation).toHaveBeenCalledTimes(1);
      expect(mockGenerateSummary).toHaveBeenCalledTimes(1);
      expect(mockChatRecordingService.saveSummary).not.toHaveBeenCalled();
    });

    it('should catch and log errors without throwing', async () => {
      const mockConversation = {
        sessionId: 'test-session',
        projectHash: 'test-hash',
        startTime: '2025-12-03T00:00:00Z',
        lastUpdated: '2025-12-03T00:10:00Z',
        messages: [
          {
            id: '1',
            timestamp: '2025-12-03T00:00:00Z',
            type: 'user' as const,
            content: [{ text: 'Hello' }],
          },
        ],
      };

      (
        mockChatRecordingService.getConversation as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockConversation);
      mockGenerateSummary.mockRejectedValue(new Error('API Error'));

      // Should not throw
      await expect(generateAndSaveSummary(mockConfig)).resolves.not.toThrow();

      expect(mockChatRecordingService.getConversation).toHaveBeenCalledTimes(1);
      expect(mockGenerateSummary).toHaveBeenCalledTimes(1);
      expect(mockChatRecordingService.saveSummary).not.toHaveBeenCalled();
    });
  });

  describe('Mock Verification Tests', () => {
    it('should call getConversation() once', async () => {
      const mockConversation = {
        sessionId: 'test-session',
        projectHash: 'test-hash',
        startTime: '2025-12-03T00:00:00Z',
        lastUpdated: '2025-12-03T00:10:00Z',
        messages: [
          {
            id: '1',
            timestamp: '2025-12-03T00:00:00Z',
            type: 'user' as const,
            content: [{ text: 'Hello' }],
          },
        ],
      };

      (
        mockChatRecordingService.getConversation as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockConversation);

      await generateAndSaveSummary(mockConfig);

      expect(mockChatRecordingService.getConversation).toHaveBeenCalledTimes(1);
      expect(mockChatRecordingService.getConversation).toHaveBeenCalledWith();
    });

    it('should call generateSummary() with correct messages', async () => {
      const mockMessages = [
        {
          id: '1',
          timestamp: '2025-12-03T00:00:00Z',
          type: 'user' as const,
          content: [{ text: 'How do I add dark mode?' }],
        },
        {
          id: '2',
          timestamp: '2025-12-03T00:01:00Z',
          type: 'gemini' as const,
          content: [{ text: 'To add dark mode...' }],
        },
      ];

      const mockConversation = {
        sessionId: 'test-session',
        projectHash: 'test-hash',
        startTime: '2025-12-03T00:00:00Z',
        lastUpdated: '2025-12-03T00:10:00Z',
        messages: mockMessages,
      };

      (
        mockChatRecordingService.getConversation as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockConversation);

      await generateAndSaveSummary(mockConfig);

      expect(mockGenerateSummary).toHaveBeenCalledTimes(1);
      expect(mockGenerateSummary).toHaveBeenCalledWith({
        messages: mockMessages,
      });
    });

    it('should call saveSummary() with generated summary', async () => {
      const mockConversation = {
        sessionId: 'test-session',
        projectHash: 'test-hash',
        startTime: '2025-12-03T00:00:00Z',
        lastUpdated: '2025-12-03T00:10:00Z',
        messages: [
          {
            id: '1',
            timestamp: '2025-12-03T00:00:00Z',
            type: 'user' as const,
            content: [{ text: 'Hello' }],
          },
        ],
      };

      (
        mockChatRecordingService.getConversation as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockConversation);
      mockGenerateSummary.mockResolvedValue('Test summary');

      await generateAndSaveSummary(mockConfig);

      expect(mockChatRecordingService.saveSummary).toHaveBeenCalledTimes(1);
      expect(mockChatRecordingService.saveSummary).toHaveBeenCalledWith(
        'Test summary',
      );
    });

    it('should not call saveSummary() if generation fails', async () => {
      const mockConversation = {
        sessionId: 'test-session',
        projectHash: 'test-hash',
        startTime: '2025-12-03T00:00:00Z',
        lastUpdated: '2025-12-03T00:10:00Z',
        messages: [
          {
            id: '1',
            timestamp: '2025-12-03T00:00:00Z',
            type: 'user' as const,
            content: [{ text: 'Hello' }],
          },
        ],
      };

      (
        mockChatRecordingService.getConversation as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockConversation);
      mockGenerateSummary.mockResolvedValue(null);

      await generateAndSaveSummary(mockConfig);

      expect(mockGenerateSummary).toHaveBeenCalledTimes(1);
      expect(mockChatRecordingService.saveSummary).not.toHaveBeenCalled();
    });

    it('should not call saveSummary() if generateSummary throws', async () => {
      const mockConversation = {
        sessionId: 'test-session',
        projectHash: 'test-hash',
        startTime: '2025-12-03T00:00:00Z',
        lastUpdated: '2025-12-03T00:10:00Z',
        messages: [
          {
            id: '1',
            timestamp: '2025-12-03T00:00:00Z',
            type: 'user' as const,
            content: [{ text: 'Hello' }],
          },
        ],
      };

      (
        mockChatRecordingService.getConversation as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockConversation);
      mockGenerateSummary.mockRejectedValue(new Error('Generation failed'));

      await generateAndSaveSummary(mockConfig);

      expect(mockGenerateSummary).toHaveBeenCalledTimes(1);
      expect(mockChatRecordingService.saveSummary).not.toHaveBeenCalled();
    });
  });
});
