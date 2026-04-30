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
import type { ConversationRecord } from './chatRecordingService.js';
import { CoreToolCallStatus } from '../scheduler/types.js';
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
  memoryScratchpad?: unknown;
  sessionId?: string;
  startTime?: string;
  lastUpdated?: string;
  kind?: ConversationRecord['kind'];
  messages?: ConversationRecord['messages'];
  userMessageCount: number;
}

function buildLegacySessionJson(fixture: SessionFixture): string {
  const messages =
    fixture.messages ??
    Array.from({ length: fixture.userMessageCount }, (_, i) => ({
      id: String(i + 1),
      timestamp: '2024-01-01T00:00:00Z',
      type: 'user',
      content: [{ text: `Message ${i + 1}` }],
    }));
  return JSON.stringify({
    sessionId: fixture.sessionId ?? 'session-id',
    projectHash: 'abc123',
    startTime: fixture.startTime ?? '2024-01-01T00:00:00Z',
    lastUpdated: fixture.lastUpdated ?? '2024-01-01T00:00:00Z',
    summary: fixture.summary,
    memoryScratchpad: fixture.memoryScratchpad,
    ...(fixture.kind ? { kind: fixture.kind } : {}),
    messages,
  });
}

function buildJsonlSession(fixture: SessionFixture): string {
  const metadata = {
    sessionId: fixture.sessionId ?? 'session-id',
    projectHash: 'abc123',
    startTime: fixture.startTime ?? '2024-01-01T00:00:00Z',
    lastUpdated: fixture.lastUpdated ?? '2024-01-01T00:00:00Z',
    ...(fixture.summary !== undefined ? { summary: fixture.summary } : {}),
    ...(fixture.memoryScratchpad !== undefined
      ? { memoryScratchpad: fixture.memoryScratchpad }
      : {}),
    ...(fixture.kind ? { kind: fixture.kind } : {}),
  };
  const messages =
    fixture.messages ??
    Array.from({ length: fixture.userMessageCount }, (_, i) => ({
      id: String(i + 1),
      timestamp: '2024-01-01T00:00:00Z',
      type: 'user',
      content: [{ text: `Message ${i + 1}` }],
    }));
  const lines: string[] = [JSON.stringify(metadata)];
  for (const message of messages) {
    lines.push(JSON.stringify(message));
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
      getProjectRoot: vi.fn().mockReturnValue(projectTempDir),
      getSessionId: vi.fn().mockReturnValue('current-session'),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue(projectTempDir),
      },
    } as unknown as Config;

    mockGenerateSummary = vi.fn().mockResolvedValue('Add dark mode to the app');

    const { SessionSummaryService } =
      await import('./sessionSummaryService.js');
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

    it('should return null if most recent session already has summary metadata', async () => {
      await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-abc12345.json',
        buildLegacySessionJson({
          userMessageCount: 5,
          summary: 'Existing summary',
          memoryScratchpad: {
            version: 1,
            workflowSummary: 'read_file -> edit',
          },
        }),
      );

      const result = await getPreviousSession(mockConfig);

      expect(result).toBeNull();
    });

    it('should return path if most recent session has summary but no scratchpad', async () => {
      const filePath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-abc12345.json',
        buildLegacySessionJson({
          userMessageCount: 5,
          summary: 'Existing summary',
        }),
      );

      const result = await getPreviousSession(mockConfig);

      expect(result).toBe(filePath);
    });

    it('should return null if most recent session has scratchpad but no summary', async () => {
      await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-abc12345.json',
        buildLegacySessionJson({
          userMessageCount: 5,
          memoryScratchpad: {
            version: 1,
            workflowSummary: 'read_file -> edit',
          },
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

    it('should skip subagent sessions when backfilling scratchpads', async () => {
      const mainPath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-main0001.jsonl',
        buildJsonlSession({
          sessionId: 'main-session',
          userMessageCount: 2,
          lastUpdated: '2024-01-01T10:00:00Z',
          summary: 'Main session summary',
        }),
      );
      await setSessionMtime(mainPath, '2024-01-01T10:00:00Z');

      await writeSession(
        chatsDir,
        'session-2024-01-02T10-00-sub00001.jsonl',
        buildJsonlSession({
          sessionId: 'subagent-session',
          userMessageCount: 2,
          lastUpdated: '2024-01-02T10:00:00Z',
          summary: 'Subagent summary',
          kind: 'subagent',
        }),
      );

      const result = await getPreviousSession(mockConfig);

      expect(result).toBe(mainPath);
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
      expect(written.memoryScratchpad).toEqual({ version: 1 });
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
          memoryScratchpad: {
            version: 1,
          },
        },
      });
    });

    it('should backfill scratchpad without regenerating summary', async () => {
      const filePath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-backfill.jsonl',
        buildJsonlSession({
          userMessageCount: 2,
          summary: 'Existing summary',
        }),
      );

      await generateSummary(mockConfig);

      expect(mockGenerateSummary).not.toHaveBeenCalled();
      const lines = (await fs.readFile(filePath, 'utf-8'))
        .split('\n')
        .filter(Boolean);
      const lastRecord = JSON.parse(lines[lines.length - 1]);
      expect(lastRecord).toEqual({
        $set: {
          memoryScratchpad: {
            version: 1,
          },
        },
      });
    });

    it('should not retry summary generation after writing a scratchpad fallback', async () => {
      const filePath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-summary-fallback.jsonl',
        buildJsonlSession({
          sessionId: 'summary-fallback-session',
          userMessageCount: 2,
          messages: [
            {
              id: 'u1',
              timestamp: '2024-01-01T00:00:00Z',
              type: 'user',
              content: [{ text: 'Read package metadata' }],
            },
            {
              id: 'g1',
              timestamp: '2024-01-01T00:00:01Z',
              type: 'gemini',
              content: [{ text: 'Reading package.json' }],
              toolCalls: [
                {
                  id: 'tool-1',
                  name: 'read_file',
                  args: { file_path: 'package.json' },
                  status: CoreToolCallStatus.Success,
                  timestamp: '2024-01-01T00:00:01Z',
                },
              ],
            },
            {
              id: 'u2',
              timestamp: '2024-01-01T00:00:02Z',
              type: 'user',
              content: [{ text: 'Done' }],
            },
          ],
        }),
      );
      mockGenerateSummary.mockResolvedValue(undefined);

      await generateSummary(mockConfig);
      await generateSummary(mockConfig);

      expect(mockGenerateSummary).toHaveBeenCalledTimes(1);
      const savedConversation =
        await chatRecordingService.loadConversationRecord(filePath);
      expect(savedConversation?.summary).toBeUndefined();
      expect(savedConversation?.memoryScratchpad).toEqual({
        version: 1,
        workflowSummary: 'read_file | paths package.json',
        toolSequence: ['read_file'],
        touchedPaths: ['package.json'],
      });
    });

    it('should refresh stale scratchpads when messages were appended after metadata', async () => {
      const filePath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-resumed1.jsonl',
        buildJsonlSession({
          sessionId: 'resumed-session',
          userMessageCount: 2,
          summary: 'Existing summary',
          lastUpdated: '2024-01-01T10:00:00Z',
        }),
      );
      await fs.appendFile(
        filePath,
        `${JSON.stringify({
          $set: {
            memoryScratchpad: {
              version: 1,
              workflowSummary: 'read_file',
              toolSequence: ['read_file'],
            },
          },
        })}\n`,
      );
      await fs.appendFile(
        filePath,
        [
          JSON.stringify({
            id: 'u-resumed',
            timestamp: '2024-01-02T00:00:00Z',
            type: 'user',
            content: [{ text: 'Update src/app.ts' }],
          }),
          JSON.stringify({
            id: 'g-resumed',
            timestamp: '2024-01-02T00:00:01Z',
            type: 'gemini',
            content: [{ text: 'Editing file' }],
            toolCalls: [
              {
                id: 'tool-resumed',
                name: 'replace',
                args: { file_path: 'src/app.ts' },
                status: CoreToolCallStatus.Success,
                timestamp: '2024-01-02T00:00:01Z',
              },
            ],
          }),
          JSON.stringify({
            $set: { lastUpdated: '2024-01-02T00:00:02Z' },
          }),
        ].join('\n') + '\n',
      );

      await generateSummary(mockConfig);

      expect(mockGenerateSummary).not.toHaveBeenCalled();
      const savedConversation =
        await chatRecordingService.loadConversationRecord(filePath);
      expect(savedConversation?.memoryScratchpad).toEqual({
        version: 1,
        workflowSummary: 'replace | paths src/app.ts',
        toolSequence: ['replace'],
        touchedPaths: ['src/app.ts'],
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
      expect(savedConversation?.memoryScratchpad).toEqual({ version: 1 });
      expect(savedConversation?.lastUpdated).toBe(newerLastUpdated);

      const lines = (await fs.readFile(filePath, 'utf-8'))
        .split('\n')
        .filter(Boolean);
      const lastRecord = JSON.parse(lines[lines.length - 1]);
      expect(lastRecord).toEqual({
        $set: {
          summary: 'Add dark mode to the app',
          memoryScratchpad: {
            version: 1,
          },
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
          memoryScratchpad: {
            version: 1,
          },
        },
      });

      const currentLines = (await fs.readFile(currentPath, 'utf-8'))
        .split('\n')
        .filter(Boolean);
      expect(currentLines).toHaveLength(2);
    });

    it('should preserve repo-root file names in scratchpad touched paths', async () => {
      const filePath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-rootpath.jsonl',
        buildJsonlSession({
          sessionId: 'root-path-session',
          userMessageCount: 2,
          summary: 'Existing summary',
          messages: [
            {
              id: 'u1',
              timestamp: '2024-01-01T00:00:00Z',
              type: 'user',
              content: [{ text: 'Inspect package.json' }],
            },
            {
              id: 'g1',
              timestamp: '2024-01-01T00:00:01Z',
              type: 'gemini',
              content: [{ text: 'Reading files' }],
              toolCalls: [
                {
                  id: 'tool-1',
                  name: 'read_file',
                  args: { file_path: 'package.json' },
                  status: CoreToolCallStatus.Success,
                  timestamp: '2024-01-01T00:00:01Z',
                },
              ],
            },
            {
              id: 'u2',
              timestamp: '2024-01-01T00:00:02Z',
              type: 'user',
              content: [{ text: 'Done' }],
            },
          ],
        }),
      );

      await generateSummary(mockConfig);

      const savedConversation =
        await chatRecordingService.loadConversationRecord(filePath);
      expect(savedConversation?.memoryScratchpad).toEqual({
        version: 1,
        workflowSummary: 'read_file | paths package.json',
        toolSequence: ['read_file'],
        touchedPaths: ['package.json'],
      });
    });

    it('should summarize shell commands without raw arguments in scratchpad tool sequence', async () => {
      const filePath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-shellcmd.jsonl',
        buildJsonlSession({
          sessionId: 'shell-command-session',
          userMessageCount: 2,
          summary: 'Existing summary',
          messages: [
            {
              id: 'u1',
              timestamp: '2024-01-01T00:00:00Z',
              type: 'user',
              content: [{ text: 'Run the migration and regenerate docs' }],
            },
            {
              id: 'g1',
              timestamp: '2024-01-01T00:00:01Z',
              type: 'gemini',
              content: [{ text: 'Running commands' }],
              toolCalls: [
                {
                  id: 'tool-1',
                  name: 'run_shell_command',
                  args: {
                    command:
                      'curl https://api.example.com -H "Authorization: Bearer sk-secret-token"',
                  },
                  status: CoreToolCallStatus.Success,
                  timestamp: '2024-01-01T00:00:01Z',
                },
                {
                  id: 'tool-2',
                  name: 'run_shell_command',
                  args: {
                    command:
                      'DATABASE_URL=postgresql://user:password@localhost/db npm run migrate -- --name add-users',
                  },
                  status: CoreToolCallStatus.Success,
                  timestamp: '2024-01-01T00:00:02Z',
                },
              ],
            },
            {
              id: 'u2',
              timestamp: '2024-01-01T00:00:03Z',
              type: 'user',
              content: [{ text: 'Done' }],
            },
          ],
        }),
      );

      await generateSummary(mockConfig);

      const savedConversation =
        await chatRecordingService.loadConversationRecord(filePath);
      expect(savedConversation?.memoryScratchpad).toEqual({
        version: 1,
        workflowSummary: 'run_shell_command: curl -> run_shell_command: npm',
        toolSequence: ['run_shell_command: curl', 'run_shell_command: npm'],
      });
      expect(
        savedConversation?.memoryScratchpad?.workflowSummary,
      ).not.toContain('Authorization');
      expect(
        savedConversation?.memoryScratchpad?.workflowSummary,
      ).not.toContain('sk-secret-token');
      expect(
        savedConversation?.memoryScratchpad?.workflowSummary,
      ).not.toContain('password');
      expect(
        savedConversation?.memoryScratchpad?.workflowSummary,
      ).not.toContain('add-users');
    });

    it('should not classify validation substrings as validation tools', async () => {
      const filePath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-validation-substring.jsonl',
        buildJsonlSession({
          sessionId: 'validation-substring-session',
          userMessageCount: 2,
          summary: 'Existing summary',
          messages: [
            {
              id: 'u1',
              timestamp: '2024-01-01T00:00:00Z',
              type: 'user',
              content: [{ text: 'Run the contest helper' }],
            },
            {
              id: 'g1',
              timestamp: '2024-01-01T00:00:01Z',
              type: 'gemini',
              content: [{ text: 'Running helper' }],
              toolCalls: [
                {
                  id: 'tool-1',
                  name: 'contest_runner',
                  args: {},
                  status: CoreToolCallStatus.Success,
                  timestamp: '2024-01-01T00:00:01Z',
                },
              ],
            },
            {
              id: 'u2',
              timestamp: '2024-01-01T00:00:02Z',
              type: 'user',
              content: [{ text: 'Done' }],
            },
          ],
        }),
      );

      await generateSummary(mockConfig);

      const savedConversation =
        await chatRecordingService.loadConversationRecord(filePath);
      expect(savedConversation?.memoryScratchpad).toEqual({
        version: 1,
        workflowSummary: 'contest_runner',
        toolSequence: ['contest_runner'],
      });
    });

    it('should cap nested path extraction depth', async () => {
      const filePath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-deep-paths.jsonl',
        buildJsonlSession({
          sessionId: 'deep-paths-session',
          userMessageCount: 2,
          summary: 'Existing summary',
          messages: [
            {
              id: 'u1',
              timestamp: '2024-01-01T00:00:00Z',
              type: 'user',
              content: [{ text: 'Edit shallow and deeply nested files' }],
            },
            {
              id: 'g1',
              timestamp: '2024-01-01T00:00:01Z',
              type: 'gemini',
              content: [{ text: 'Editing files' }],
              toolCalls: [
                {
                  id: 'tool-1',
                  name: 'replace',
                  args: {
                    file_path: 'src/shallow.ts',
                    level1: {
                      level2: {
                        level3: {
                          level4: {
                            level5: {
                              level6: {
                                level7: {
                                  file_path: 'src/deep.ts',
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  status: CoreToolCallStatus.Success,
                  timestamp: '2024-01-01T00:00:01Z',
                },
              ],
            },
            {
              id: 'u2',
              timestamp: '2024-01-01T00:00:02Z',
              type: 'user',
              content: [{ text: 'Done' }],
            },
          ],
        }),
      );

      await generateSummary(mockConfig);

      const savedConversation =
        await chatRecordingService.loadConversationRecord(filePath);
      expect(savedConversation?.memoryScratchpad).toEqual({
        version: 1,
        workflowSummary: 'replace | paths src/shallow.ts',
        toolSequence: ['replace'],
        touchedPaths: ['src/shallow.ts'],
      });
    });

    it('should use the latest validation result in scratchpad metadata', async () => {
      const filePath = await writeSession(
        chatsDir,
        'session-2024-01-01T10-00-validation.jsonl',
        buildJsonlSession({
          sessionId: 'validation-session',
          userMessageCount: 2,
          summary: 'Existing summary',
          messages: [
            {
              id: 'u1',
              timestamp: '2024-01-01T00:00:00Z',
              type: 'user',
              content: [{ text: 'Fix the tests' }],
            },
            {
              id: 'g1',
              timestamp: '2024-01-01T00:00:01Z',
              type: 'gemini',
              content: [{ text: 'Running tests' }],
              toolCalls: [
                {
                  id: 'tool-1',
                  name: 'run_shell_command',
                  args: { command: 'npm test' },
                  status: CoreToolCallStatus.Error,
                  timestamp: '2024-01-01T00:00:01Z',
                },
                {
                  id: 'tool-2',
                  name: 'run_shell_command',
                  args: { command: 'npm test' },
                  status: CoreToolCallStatus.Success,
                  timestamp: '2024-01-01T00:00:02Z',
                },
              ],
            },
            {
              id: 'u2',
              timestamp: '2024-01-01T00:00:03Z',
              type: 'user',
              content: [{ text: 'Done' }],
            },
          ],
        }),
      );

      await generateSummary(mockConfig);

      const savedConversation =
        await chatRecordingService.loadConversationRecord(filePath);
      expect(savedConversation?.memoryScratchpad).toEqual({
        version: 1,
        workflowSummary: 'run_shell_command: npm | validated',
        toolSequence: ['run_shell_command: npm'],
        validationStatus: 'passed',
      });
    });
  });
});
