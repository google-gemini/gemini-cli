/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSummary, getPreviousSession } from './sessionSummaryUtils.js';
import type { Config } from '../config/config.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import * as chatRecordingService from './chatRecordingService.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

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

vi.mock('./chatRecordingService.js', async () => {
  const actual = await vi.importActual<
    typeof import('./chatRecordingService.js')
  >('./chatRecordingService.js');
  return {
    ...actual,
    loadConversationRecord: vi.fn(actual.loadConversationRecord),
  };
});

interface SessionFixture {
  summary?: string;
  sessionId?: string;
  startTime?: string;
  lastUpdated?: string;
  userMessageCount: number;
}

function buildLegacySessionJson(fixture: SessionFixture): string {
  return JSON.stringify({
    sessionId: fixture.sessionId ?? 'session-id',
    projectHash: 'abc123',
    startTime: fixture.startTime ?? '2024-01-01T00:00:00Z',
    lastUpdated: fixture.lastUpdated ?? '2024-01-01T00:00:00Z',
    summary: fixture.summary,
    messages: Array.from({ length: fixture.userMessageCount }, (_, i) => ({
      id: String(i + 1),
      timestamp: '2024-01-01T00:00:00Z',
      type: 'user',
      content: [{ text: `Message ${i + 1}` }],
    })),
  });
}

function buildJsonlSession(fixture: SessionFixture): string {
  const metadata = {
    sessionId: fixture.sessionId ?? 'session-id',
    projectHash: 'abc123',
    startTime: fixture.startTime ?? '2024-01-01T00:00:00Z',
    lastUpdated: fixture.lastUpdated ?? '2024-01-01T00:00:00Z',
    ...(fixture.summary !== undefined ? { summary: fixture.summary } : {}),
  };
  const lines: string[] = [JSON.stringify(metadata)];
  for (let i = 0; i < fixture.userMessageCount; i++) {
    lines.push(
      JSON.stringify({
        id: String(i + 1),
        timestamp: '2024-01-01T00:00:00Z',
        type: 'user',
        content: [{ text: `Message ${i + 1}` }],
      }),
    );
  }
  return lines.join('\n') + '\n';
}

async function writeSession(
  chatsDir: string,
  fileName: string,
  contents: string,
): Promise<string> {
  const filePath = path.join(chatsDir, fileName);
  await fs.writeFile(filePath, contents);
  return filePath;
}

async function setSessionMtime(
  filePath: string,
  timestamp: string,
): Promise<void> {
  const date = new Date(timestamp);
  await fs.utimes(filePath, date, date);
}

describe('sessionSummaryUtils', () => {
  let tmpDir: string;
  let projectTempDir: string;
  let chatsDir: string;
  let mockConfig: Config;
  let mockContentGenerator: ContentGenerator;
  let mockGenerateSummary: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-summary-utils-'));
    projectTempDir = path.join(tmpDir, 'project');
    chatsDir = path.join(projectTempDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    mockContentGenerator = {} as ContentGenerator;

    mockConfig = {
      getContentGenerator: vi.fn().mockReturnValue(mockContentGenerator),
      getSessionId: vi.fn().mockReturnValue('current-session'),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue(projectTempDir),
      },
    } as unknown as Config;

    mockGenerateSummary = vi.fn().mockResolvedValue('Add dark mode to the app');

    const { SessionSummaryService } = await import(
      './sessionSummaryService.js'
    );
    (
      SessionSummaryService as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(() => ({
      generateSummary: mockGenerateSummary,
    }));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('getPreviousSession', () => {
    it('should return null if chats directory does not exist', async () => {
      await fs.rm(chatsDir, { recursive: true, force: true });

      const result = await getPreviousSession(mockConfig);

      expect(result).toBeNull();
    });

    it('should return null if no session files exist', async () => {
      const result = await getPreviousSession(mockConfig);

      expect(result).toBeNull();
    });

    it('should return null if most recent session already has summary', async () => {
      await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-abc12345.json',
        buildLegacySessionJson({
          userMessageCount: 5,
          summary: 'Existing summary',
        }),
      );

      const result = await getPreviousSession(mockConfig);

      expect(result).toBeNull();
    });

    it('should return null if most recent session has 1 or fewer user messages', async () => {
      await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-abc12345.json',
        buildLegacySessionJson({ userMessageCount: 1 }),
      );

      const result = await getPreviousSession(mockConfig);

      expect(result).toBeNull();
    });

    it('should return path if most recent session has more than 1 user message and no summary', async () => {
      const filePath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-abc12345.json',
        buildLegacySessionJson({ userMessageCount: 2 }),
      );

      const result = await getPreviousSession(mockConfig);

      expect(result).toBe(filePath);
    });

    it('should select most recently updated session', async () => {
      await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-older000.json',
        buildLegacySessionJson({
          userMessageCount: 2,
          lastUpdated: '2024-01-01T10:00:00Z',
        }),
      );
      const newerPath = await writeSession(
        chatsDir,
        'session-2024-01-02T10-00-newer000.json',
        buildLegacySessionJson({
          userMessageCount: 2,
          lastUpdated: '2024-01-02T10:00:00Z',
        }),
      );

      const result = await getPreviousSession(mockConfig);

      expect(result).toBe(newerPath);
    });

    it('should ignore corrupted session files', async () => {
      await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-abc12345.json',
        'invalid json',
      );

      const result = await getPreviousSession(mockConfig);

      expect(result).toBeNull();
    });

    it('should support JSONL sessions and sort by lastUpdated instead of filename', async () => {
      await writeSession(
        chatsDir,
        'session-2024-01-02T10-00-older000.jsonl',
        buildJsonlSession({
          userMessageCount: 2,
          lastUpdated: '2024-01-01T10:00:00Z',
          sessionId: 'older-session',
        }),
      );
      const newerPath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-newer000.jsonl',
        buildJsonlSession({
          userMessageCount: 2,
          lastUpdated: '2024-01-03T10:00:00Z',
          sessionId: 'newer-session',
        }),
      );

      const result = await getPreviousSession(mockConfig);

      expect(result).toBe(newerPath);
    });

    it('should stop scanning once older mtimes cannot beat the best lastUpdated', async () => {
      const loadConversationRecord = vi.mocked(
        chatRecordingService.loadConversationRecord,
      );

      const currentPath = await writeSession(
        chatsDir,
        'session-2024-01-03T10-00-cur00001.jsonl',
        buildJsonlSession({
          sessionId: 'current-session',
          userMessageCount: 2,
          lastUpdated: '2024-01-03T10:00:00Z',
        }),
      );
      await setSessionMtime(currentPath, '2024-01-03T10:00:00Z');

      const bestPath = await writeSession(
        chatsDir,
        'session-2024-01-02T10-00-best0001.jsonl',
        buildJsonlSession({
          sessionId: 'best-session',
          userMessageCount: 2,
          lastUpdated: '2024-01-02T10:00:00Z',
        }),
      );
      await setSessionMtime(bestPath, '2024-01-02T10:00:00Z');

      const olderPath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-older001.jsonl',
        buildJsonlSession({
          sessionId: 'older-session',
          userMessageCount: 2,
          lastUpdated: '2024-01-01T10:00:00Z',
        }),
      );
      await setSessionMtime(olderPath, '2024-01-01T10:00:00Z');

      const result = await getPreviousSession(mockConfig);

      expect(result).toBe(bestPath);
      expect(loadConversationRecord).toHaveBeenCalledTimes(2);
      expect(loadConversationRecord).not.toHaveBeenCalledWith(olderPath, {
        metadataOnly: true,
      });
    });
  });

  describe('generateSummary', () => {
    it('should not throw if getPreviousSession returns null', async () => {
      await fs.rm(chatsDir, { recursive: true, force: true });

      await expect(generateSummary(mockConfig)).resolves.not.toThrow();
    });

    it('should generate and save summary for legacy JSON sessions', async () => {
      const lastUpdated = '2024-01-01T10:00:00Z';
      const filePath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-abc12345.json',
        buildLegacySessionJson({ userMessageCount: 2, lastUpdated }),
      );

      await generateSummary(mockConfig);

      expect(mockGenerateSummary).toHaveBeenCalledTimes(1);
      const written = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      expect(written.summary).toBe('Add dark mode to the app');
      expect(written.lastUpdated).toBe(lastUpdated);
    });

    it('should handle errors gracefully without throwing', async () => {
      await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-abc12345.json',
        buildLegacySessionJson({ userMessageCount: 2 }),
      );
      mockGenerateSummary.mockRejectedValue(new Error('API Error'));

      await expect(generateSummary(mockConfig)).resolves.not.toThrow();
    });

    it('should append a metadata update when saving a summary to JSONL', async () => {
      const lastUpdated = '2024-01-01T10:00:00Z';
      const filePath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-abc12345.jsonl',
        buildJsonlSession({ userMessageCount: 2, lastUpdated }),
      );

      await generateSummary(mockConfig);

      expect(mockGenerateSummary).toHaveBeenCalledTimes(1);
      const lines = (await fs.readFile(filePath, 'utf-8'))
        .split('\n')
        .filter(Boolean);
      const lastRecord = JSON.parse(lines[lines.length - 1]);
      expect(lastRecord).toEqual({
        $set: {
          summary: 'Add dark mode to the app',
        },
      });
    });

    it('should preserve a newer JSONL lastUpdated written concurrently', async () => {
      const initialLastUpdated = '2024-01-01T10:00:00Z';
      const newerLastUpdated = '2024-01-02T12:34:56Z';
      const filePath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-race.jsonl',
        buildJsonlSession({
          userMessageCount: 2,
          lastUpdated: initialLastUpdated,
        }),
      );

      const actualChatRecordingService = await vi.importActual<
        typeof import('./chatRecordingService.js')
      >('./chatRecordingService.js');
      let injectedConcurrentUpdate = false;
      let sessionReadCount = 0;
      vi.mocked(chatRecordingService.loadConversationRecord).mockImplementation(
        async (targetPath, options) => {
          const conversation =
            await actualChatRecordingService.loadConversationRecord(
              targetPath,
              options,
            );

          if (targetPath === filePath) {
            sessionReadCount += 1;
          }

          if (
            !injectedConcurrentUpdate &&
            targetPath === filePath &&
            sessionReadCount === 2
          ) {
            injectedConcurrentUpdate = true;
            await fs.appendFile(
              filePath,
              `${JSON.stringify({ $set: { lastUpdated: newerLastUpdated } })}\n`,
            );
          }

          return conversation;
        },
      );

      await generateSummary(mockConfig);

      expect(injectedConcurrentUpdate).toBe(true);
      const savedConversation =
        await chatRecordingService.loadConversationRecord(filePath);
      expect(savedConversation?.summary).toBe('Add dark mode to the app');
      expect(savedConversation?.lastUpdated).toBe(newerLastUpdated);

      const lines = (await fs.readFile(filePath, 'utf-8'))
        .split('\n')
        .filter(Boolean);
      const lastRecord = JSON.parse(lines[lines.length - 1]);
      expect(lastRecord).toEqual({
        $set: {
          summary: 'Add dark mode to the app',
        },
      });
    });

    it('should skip the active startup session and summarize the previous session', async () => {
      const previousPath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-prev0001.jsonl',
        buildJsonlSession({
          sessionId: 'previous-session',
          userMessageCount: 2,
          lastUpdated: '2024-01-01T10:00:00Z',
        }),
      );
      const currentPath = await writeSession(
        chatsDir,
        'session-2024-01-02T10-00-cur00001.jsonl',
        buildJsonlSession({
          sessionId: 'current-session',
          userMessageCount: 1,
          lastUpdated: '2024-01-02T10:00:00Z',
        }),
      );

      await generateSummary(mockConfig);

      expect(mockGenerateSummary).toHaveBeenCalledTimes(1);

      const previousLines = (await fs.readFile(previousPath, 'utf-8'))
        .split('\n')
        .filter(Boolean);
      expect(JSON.parse(previousLines[previousLines.length - 1])).toEqual({
        $set: {
          summary: 'Add dark mode to the app',
        },
      });

      const currentLines = (await fs.readFile(currentPath, 'utf-8'))
        .split('\n')
        .filter(Boolean);
      expect(currentLines).toHaveLength(2);
    });
  });
});
