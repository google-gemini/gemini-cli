/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSummary, getPreviousSession } from './sessionSummaryUtils.js';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import * as fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import * as path from 'node:path';

// Mock fs/promises
vi.mock('node:fs/promises');
const mockReaddir = fs.readdir as unknown as ReturnType<typeof vi.fn>;

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

// Helper to create a session with N user messages
function createSessionWithUserMessages(
  count: number,
  options: { summary?: string; sessionId?: string } = {},
) {
  return JSON.stringify({
    sessionId: options.sessionId ?? 'session-id',
    summary: options.summary,
    messages: Array.from({ length: count }, (_, i) => ({
      id: String(i + 1),
      type: 'user',
      content: [{ text: `Message ${i + 1}` }],
    })),
  });
}

function createJsonlSessionWithUserMessages(
  count: number,
  options: { summary?: string; sessionId?: string } = {},
) {
  const now = new Date().toISOString();
  const metadata = {
    type: 'session_metadata',
    sessionId: options.sessionId ?? 'session-id',
    summary: options.summary,
    startTime: now,
    lastUpdated: now,
  };
  const messages = Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    type: 'user',
    content: [{ text: `Message ${i + 1}` }],
  }));
  return `${[metadata, ...messages].map((entry) => JSON.stringify(entry)).join('\n')}\n`;
}

describe('sessionSummaryUtils', () => {
  let mockConfig: Config;
  let mockContentGenerator: ContentGenerator;
  let mockGenerateSummary: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock content generator
    mockContentGenerator = {} as ContentGenerator;

    // Setup mock config
    mockConfig = {
      getContentGenerator: vi.fn().mockReturnValue(mockContentGenerator),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
      },
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

  describe('getPreviousSession', () => {
    it('should return null if chats directory does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await getPreviousSession(mockConfig);

      expect(result).toBeNull();
    });

    it('should return null if no session files exist', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue([]);

      const result = await getPreviousSession(mockConfig);

      expect(result).toBeNull();
    });

    it('should return null if most recent session already has summary', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue([
        'session-2024-01-01T10-00-abc12345.jsonl',
      ]);
      vi.mocked(fs.readFile).mockResolvedValue(
        createJsonlSessionWithUserMessages(5, { summary: 'Existing summary' }),
      );

      const result = await getPreviousSession(mockConfig);

      expect(result).toBeNull();
    });

    it('should return null if most recent session has 1 or fewer user messages', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue([
        'session-2024-01-01T10-00-abc12345.jsonl',
      ]);
      vi.mocked(fs.readFile).mockResolvedValue(
        createJsonlSessionWithUserMessages(1),
      );

      const result = await getPreviousSession(mockConfig);

      expect(result).toBeNull();
    });

    it('should return path if most recent session has more than 1 user message and no summary', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue([
        'session-2024-01-01T10-00-abc12345.jsonl',
      ]);
      vi.mocked(fs.readFile).mockResolvedValue(
        createJsonlSessionWithUserMessages(2),
      );

      const result = await getPreviousSession(mockConfig);

      expect(result).toBe(
        path.join(
          '/tmp/project',
          'chats',
          'session-2024-01-01T10-00-abc12345.jsonl',
        ),
      );
    });

    it('should select most recently created session by filename', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue([
        'session-2024-01-01T10-00-older000.jsonl',
        'session-2024-01-02T10-00-newer000.jsonl',
      ]);
      vi.mocked(fs.readFile).mockResolvedValue(
        createJsonlSessionWithUserMessages(2),
      );

      const result = await getPreviousSession(mockConfig);

      expect(result).toBe(
        path.join(
          '/tmp/project',
          'chats',
          'session-2024-01-02T10-00-newer000.jsonl',
        ),
      );
    });

    it('should handle JSONL sessions when selecting the most recent session', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue([
        'session-2024-01-01T10-00-older000.jsonl',
        'session-2024-01-02T10-00-newer000.jsonl',
      ]);
      vi.mocked(fs.readFile).mockResolvedValue(
        createJsonlSessionWithUserMessages(2),
      );

      const result = await getPreviousSession(mockConfig);

      expect(result).toBe(
        path.join(
          '/tmp/project',
          'chats',
          'session-2024-01-02T10-00-newer000.jsonl',
        ),
      );
    });

    it('should return null if most recent session file is corrupted', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue(['session-2024-01-01T10-00-abc12345.json']);
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');

      const result = await getPreviousSession(mockConfig);

      expect(result).toBeNull();
    });
  });

  describe('generateSummary', () => {
    it('should not throw if getPreviousSession returns null', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      await expect(generateSummary(mockConfig)).resolves.not.toThrow();
    });

    it('should generate and save summary for session needing one', async () => {
      const sessionPath = path.join(
        '/tmp/project',
        'chats',
        'session-2024-01-01T10-00-abc12345.jsonl',
      );

      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue([
        'session-2024-01-01T10-00-abc12345.jsonl',
      ]);
      vi.mocked(fs.readFile).mockResolvedValue(
        createJsonlSessionWithUserMessages(2),
      );
      vi.mocked(fs.appendFile).mockResolvedValue(undefined);

      await generateSummary(mockConfig);

      expect(mockGenerateSummary).toHaveBeenCalledTimes(1);
      expect(fs.appendFile).toHaveBeenCalledTimes(1);
      expect(fs.appendFile).toHaveBeenCalledWith(
        sessionPath,
        expect.stringContaining('Add dark mode to the app'),
      );
    });

    it('should generate and save summary for legacy JSON session', async () => {
      const sessionPath = path.join(
        '/tmp/project',
        'chats',
        'session-2024-01-01T10-00-legacy000.json',
      );

      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue([
        'session-2024-01-01T10-00-legacy000.json',
      ]);
      vi.mocked(fs.readFile).mockResolvedValue(
        createSessionWithUserMessages(2),
      );
      vi.mocked(fs.stat)
        .mockResolvedValueOnce({ mtimeMs: 123 } as Stats)
        .mockResolvedValueOnce({ mtimeMs: 123 } as Stats);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await generateSummary(mockConfig);

      expect(mockGenerateSummary).toHaveBeenCalledTimes(1);
      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      expect(fs.writeFile).toHaveBeenCalledWith(
        `${sessionPath}.tmp`,
        expect.stringContaining('Add dark mode to the app'),
      );
      expect(fs.rename).toHaveBeenCalledWith(`${sessionPath}.tmp`, sessionPath);
    });

    it('should append summary metadata for JSONL sessions needing one', async () => {
      const sessionPath = path.join(
        '/tmp/project',
        'chats',
        'session-2024-01-01T10-00-abc12345.jsonl',
      );

      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue([
        'session-2024-01-01T10-00-abc12345.jsonl',
      ]);
      vi.mocked(fs.readFile).mockResolvedValue(
        createJsonlSessionWithUserMessages(2),
      );
      vi.mocked(fs.appendFile).mockResolvedValue(undefined);

      await generateSummary(mockConfig);

      expect(mockGenerateSummary).toHaveBeenCalledTimes(1);
      expect(fs.appendFile).toHaveBeenCalledTimes(1);
      expect(fs.appendFile).toHaveBeenCalledWith(
        sessionPath,
        expect.stringContaining('session_metadata'),
      );
    });

    it('should handle errors gracefully without throwing', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue(['session-2024-01-01T10-00-abc12345.json']);
      vi.mocked(fs.readFile).mockResolvedValue(
        createSessionWithUserMessages(2),
      );
      mockGenerateSummary.mockRejectedValue(new Error('API Error'));

      await expect(generateSummary(mockConfig)).resolves.not.toThrow();
    });
  });
});
