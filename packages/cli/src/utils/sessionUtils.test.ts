/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SessionSelector,
  extractFirstUserMessage,
  formatRelativeTime,
  hasUserOrAssistantMessage,
  SessionError,
  type SessionInfo,
} from './sessionUtils.js';
import type { Config, MessageRecord } from '@google/gemini-cli-core';
import { SESSION_FILE_PREFIX } from '@google/gemini-cli-core';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

describe('SessionSelector', () => {
  let tmpDir: string;
  let config: Config;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tmpDir = path.join(process.cwd(), '.tmp-test-sessions');
    await fs.mkdir(tmpDir, { recursive: true });

    // Mock config
    config = {
      storage: {
        getProjectTempDir: () => tmpDir,
      },
      getSessionId: () => 'current-session-id',
    } as Partial<Config> as Config;
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  it('should resolve session by UUID', async () => {
    const sessionId1 = randomUUID();
    const sessionId2 = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const session1 = {
      sessionId: sessionId1,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Test message 1',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    const session2 = {
      sessionId: sessionId2,
      projectHash: 'test-hash',
      startTime: '2024-01-01T11:00:00.000Z',
      lastUpdated: '2024-01-01T11:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Test message 2',
          id: 'msg2',
          timestamp: '2024-01-01T11:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId1.slice(0, 8)}.json`,
      ),
      JSON.stringify(session1, null, 2),
    );

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T11-00-${sessionId2.slice(0, 8)}.json`,
      ),
      JSON.stringify(session2, null, 2),
    );

    const sessionSelector = new SessionSelector(config);

    // Test resolving by UUID
    const result1 = await sessionSelector.resolveSession(sessionId1);
    expect(result1.sessionData.sessionId).toBe(sessionId1);
    expect(result1.sessionData.messages[0].content).toBe('Test message 1');

    const result2 = await sessionSelector.resolveSession(sessionId2);
    expect(result2.sessionData.sessionId).toBe(sessionId2);
    expect(result2.sessionData.messages[0].content).toBe('Test message 2');
  });

  it('should resolve session by index', async () => {
    const sessionId1 = randomUUID();
    const sessionId2 = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const session1 = {
      sessionId: sessionId1,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'First session',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    const session2 = {
      sessionId: sessionId2,
      projectHash: 'test-hash',
      startTime: '2024-01-01T11:00:00.000Z',
      lastUpdated: '2024-01-01T11:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Second session',
          id: 'msg2',
          timestamp: '2024-01-01T11:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId1.slice(0, 8)}.json`,
      ),
      JSON.stringify(session1, null, 2),
    );

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T11-00-${sessionId2.slice(0, 8)}.json`,
      ),
      JSON.stringify(session2, null, 2),
    );

    const sessionSelector = new SessionSelector(config);

    // Test resolving by index (1-based)
    const result1 = await sessionSelector.resolveSession('1');
    expect(result1.sessionData.messages[0].content).toBe('First session');

    const result2 = await sessionSelector.resolveSession('2');
    expect(result2.sessionData.messages[0].content).toBe('Second session');
  });

  it('should resolve latest session', async () => {
    const sessionId1 = randomUUID();
    const sessionId2 = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const session1 = {
      sessionId: sessionId1,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'First session',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    const session2 = {
      sessionId: sessionId2,
      projectHash: 'test-hash',
      startTime: '2024-01-01T11:00:00.000Z',
      lastUpdated: '2024-01-01T11:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Latest session',
          id: 'msg2',
          timestamp: '2024-01-01T11:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId1.slice(0, 8)}.json`,
      ),
      JSON.stringify(session1, null, 2),
    );

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T11-00-${sessionId2.slice(0, 8)}.json`,
      ),
      JSON.stringify(session2, null, 2),
    );

    const sessionSelector = new SessionSelector(config);

    // Test resolving latest
    const result = await sessionSelector.resolveSession('latest');
    expect(result.sessionData.messages[0].content).toBe('Latest session');
  });

  it('should deduplicate sessions by ID', async () => {
    const sessionId = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const sessionOriginal = {
      sessionId,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Original',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    const sessionDuplicate = {
      sessionId,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T11:00:00.000Z', // Newer
      messages: [
        {
          type: 'user',
          content: 'Newer Duplicate',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    // File 1
    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId.slice(0, 8)}.json`,
      ),
      JSON.stringify(sessionOriginal, null, 2),
    );

    // File 2 (Simulate a copy or newer version with same ID)
    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T11-00-${sessionId.slice(0, 8)}.json`,
      ),
      JSON.stringify(sessionDuplicate, null, 2),
    );

    const sessionSelector = new SessionSelector(config);
    const sessions = await sessionSelector.listSessions();

    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(sessionId);
    // Should keep the one with later lastUpdated
    expect(sessions[0].lastUpdated).toBe('2024-01-01T11:00:00.000Z');
  });

  it('should throw error for invalid session identifier', async () => {
    const sessionId1 = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const session1 = {
      sessionId: sessionId1,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Test message 1',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId1.slice(0, 8)}.json`,
      ),
      JSON.stringify(session1, null, 2),
    );

    const sessionSelector = new SessionSelector(config);

    await expect(
      sessionSelector.resolveSession('invalid-uuid'),
    ).rejects.toThrow(SessionError);

    await expect(sessionSelector.resolveSession('999')).rejects.toThrow(
      SessionError,
    );
  });

  it('should throw SessionError with NO_SESSIONS_FOUND when resolving latest with no sessions', async () => {
    // Empty chats directory — no session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    const emptyConfig = {
      storage: {
        getProjectTempDir: () => tmpDir,
      },
      getSessionId: () => 'current-session-id',
    } as Partial<Config> as Config;

    const sessionSelector = new SessionSelector(emptyConfig);

    await expect(sessionSelector.resolveSession('latest')).rejects.toSatisfy(
      (error) => {
        expect(error).toBeInstanceOf(SessionError);
        expect((error as SessionError).code).toBe('NO_SESSIONS_FOUND');
        return true;
      },
    );
  });

  it('should not list sessions with only system messages', async () => {
    const sessionIdWithUser = randomUUID();
    const sessionIdSystemOnly = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    // Session with user message - should be listed
    const sessionWithUser = {
      sessionId: sessionIdWithUser,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Hello world',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    // Session with only system messages - should NOT be listed
    const sessionSystemOnly = {
      sessionId: sessionIdSystemOnly,
      projectHash: 'test-hash',
      startTime: '2024-01-01T11:00:00.000Z',
      lastUpdated: '2024-01-01T11:30:00.000Z',
      messages: [
        {
          type: 'info',
          content: 'Session started',
          id: 'msg1',
          timestamp: '2024-01-01T11:00:00.000Z',
        },
        {
          type: 'error',
          content: 'An error occurred',
          id: 'msg2',
          timestamp: '2024-01-01T11:01:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionIdWithUser.slice(0, 8)}.json`,
      ),
      JSON.stringify(sessionWithUser, null, 2),
    );

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T11-00-${sessionIdSystemOnly.slice(0, 8)}.json`,
      ),
      JSON.stringify(sessionSystemOnly, null, 2),
    );

    const sessionSelector = new SessionSelector(config);
    const sessions = await sessionSelector.listSessions();

    // Should only list the session with user message
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(sessionIdWithUser);
  });

  it('should list session with gemini message even without user message', async () => {
    const sessionIdGeminiOnly = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    // Session with only gemini message - should be listed
    const sessionGeminiOnly = {
      sessionId: sessionIdGeminiOnly,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'gemini',
          content: 'Hello, how can I help?',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionIdGeminiOnly.slice(0, 8)}.json`,
      ),
      JSON.stringify(sessionGeminiOnly, null, 2),
    );

    const sessionSelector = new SessionSelector(config);
    const sessions = await sessionSelector.listSessions();

    // Should list the session with gemini message
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(sessionIdGeminiOnly);
  });

  it('should not list sessions marked as subagent', async () => {
    const mainSessionId = randomUUID();
    const subagentSessionId = randomUUID();

    // Create test session files
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    // Main session - should be listed
    const mainSession = {
      sessionId: mainSessionId,
      projectHash: 'test-hash',
      startTime: '2024-01-01T10:00:00.000Z',
      lastUpdated: '2024-01-01T10:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Hello world',
          id: 'msg1',
          timestamp: '2024-01-01T10:00:00.000Z',
        },
      ],
      kind: 'main',
    };

    // Subagent session - should NOT be listed
    const subagentSession = {
      sessionId: subagentSessionId,
      projectHash: 'test-hash',
      startTime: '2024-01-01T11:00:00.000Z',
      lastUpdated: '2024-01-01T11:30:00.000Z',
      messages: [
        {
          type: 'user',
          content: 'Internal subagent task',
          id: 'msg1',
          timestamp: '2024-01-01T11:00:00.000Z',
        },
      ],
      kind: 'subagent',
    };

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${mainSessionId.slice(0, 8)}.json`,
      ),
      JSON.stringify(mainSession, null, 2),
    );

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T11-00-${subagentSessionId.slice(0, 8)}.json`,
      ),
      JSON.stringify(subagentSession, null, 2),
    );

    const sessionSelector = new SessionSelector(config);
    const sessions = await sessionSelector.listSessions();

    // Should only list the main session
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(mainSessionId);
  });
});

describe('extractFirstUserMessage', () => {
  it('should extract first non-resume user message', () => {
    const messages = [
      {
        type: 'user',
        content: '/resume',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
      {
        type: 'user',
        content: 'Hello world',
        id: 'msg2',
        timestamp: '2024-01-01T10:01:00.000Z',
      },
    ] as MessageRecord[];

    expect(extractFirstUserMessage(messages)).toBe('Hello world');
  });

  it('should not truncate long messages', () => {
    const longMessage = 'a'.repeat(150);
    const messages = [
      {
        type: 'user',
        content: longMessage,
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    const result = extractFirstUserMessage(messages);
    expect(result).toBe(longMessage);
  });

  it('should return "Empty conversation" for no user messages', () => {
    const messages = [
      {
        type: 'gemini',
        content: 'Hello',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    expect(extractFirstUserMessage(messages)).toBe('Empty conversation');
  });
});

describe('hasUserOrAssistantMessage', () => {
  it('should return true when session has user message', () => {
    const messages = [
      {
        type: 'user',
        content: 'Hello',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(true);
  });

  it('should return true when session has gemini message', () => {
    const messages = [
      {
        type: 'gemini',
        content: 'Hello, how can I help?',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(true);
  });

  it('should return true when session has both user and gemini messages', () => {
    const messages = [
      {
        type: 'user',
        content: 'Hello',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
      {
        type: 'gemini',
        content: 'Hi there!',
        id: 'msg2',
        timestamp: '2024-01-01T10:01:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(true);
  });

  it('should return false when session only has info messages', () => {
    const messages = [
      {
        type: 'info',
        content: 'Session started',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(false);
  });

  it('should return false when session only has error messages', () => {
    const messages = [
      {
        type: 'error',
        content: 'An error occurred',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(false);
  });

  it('should return false when session only has warning messages', () => {
    const messages = [
      {
        type: 'warning',
        content: 'Warning message',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(false);
  });

  it('should return false when session only has system messages (mixed)', () => {
    const messages = [
      {
        type: 'info',
        content: 'Session started',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
      {
        type: 'error',
        content: 'An error occurred',
        id: 'msg2',
        timestamp: '2024-01-01T10:01:00.000Z',
      },
      {
        type: 'warning',
        content: 'Warning message',
        id: 'msg3',
        timestamp: '2024-01-01T10:02:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(false);
  });

  it('should return true when session has user message among system messages', () => {
    const messages = [
      {
        type: 'info',
        content: 'Session started',
        id: 'msg1',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
      {
        type: 'user',
        content: 'Hello',
        id: 'msg2',
        timestamp: '2024-01-01T10:01:00.000Z',
      },
      {
        type: 'error',
        content: 'An error occurred',
        id: 'msg3',
        timestamp: '2024-01-01T10:02:00.000Z',
      },
    ] as MessageRecord[];

    expect(hasUserOrAssistantMessage(messages)).toBe(true);
  });

  it('should return false for empty messages array', () => {
    const messages: MessageRecord[] = [];
    expect(hasUserOrAssistantMessage(messages)).toBe(false);
  });
});

describe('formatRelativeTime', () => {
  it('should format time correctly', () => {
    const now = new Date();

    // 5 minutes ago
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinutesAgo.toISOString())).toBe(
      '5 minutes ago',
    );

    // 1 minute ago
    const oneMinuteAgo = new Date(now.getTime() - 1 * 60 * 1000);
    expect(formatRelativeTime(oneMinuteAgo.toISOString())).toBe('1 minute ago');

    // 2 hours ago
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoHoursAgo.toISOString())).toBe('2 hours ago');

    // 1 hour ago
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    expect(formatRelativeTime(oneHourAgo.toISOString())).toBe('1 hour ago');

    // 3 days ago
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeDaysAgo.toISOString())).toBe('3 days ago');

    // 1 day ago
    const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(oneDayAgo.toISOString())).toBe('1 day ago');

    // Just now (within 60 seconds)
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
    expect(formatRelativeTime(thirtySecondsAgo.toISOString())).toBe('Just now');
  });
});

describe('SessionError.invalidSessionIdentifier', () => {
  it('returns fallback message when no sessions are provided', () => {
    const error = SessionError.invalidSessionIdentifier('bad-id');
    expect(error.code).toBe('INVALID_SESSION_IDENTIFIER');
    expect(error.message).toContain('"bad-id"');
    expect(error.message).toContain('--list-sessions');
  });

  it('includes compact session list in message when sessions are provided', () => {
    const sessions = [
      {
        id: 'uuid-1',
        displayName: 'Fix auth bug',
        lastUpdated: '2024-01-01T10:00:00.000Z',
        startTime: '2024-01-01T09:00:00.000Z',
        index: 1,
      },
      {
        id: 'uuid-2',
        displayName: 'Refactor database',
        lastUpdated: '2024-01-02T10:00:00.000Z',
        startTime: '2024-01-02T09:00:00.000Z',
        index: 2,
      },
    ] as SessionInfo[];

    const error = SessionError.invalidSessionIdentifier('99', sessions);
    expect(error.code).toBe('INVALID_SESSION_IDENTIFIER');
    expect(error.message).toContain('"99"');
    expect(error.message).toContain('Fix auth bug');
    expect(error.message).toContain('Refactor database');
    expect(error.message).toContain('--resume 1');
    expect(error.message).toContain('--resume 2');
    expect(error.message).toContain('--resume latest');
    // Should NOT include the generic --list-sessions redirect
    expect(error.message).not.toContain(
      'Use --list-sessions to see available sessions',
    );
  });

  it('sorts sessions oldest-first regardless of input order', () => {
    const sessions = [
      {
        id: 'uuid-newer',
        displayName: 'Newer session',
        lastUpdated: '2024-01-02T10:00:00.000Z',
        startTime: '2024-01-02T09:00:00.000Z',
        index: 2,
      },
      {
        id: 'uuid-older',
        displayName: 'Older session',
        lastUpdated: '2024-01-01T10:00:00.000Z',
        startTime: '2024-01-01T09:00:00.000Z',
        index: 1,
      },
    ] as SessionInfo[];

    const error = SessionError.invalidSessionIdentifier('bad', sessions);
    const olderPos = error.message.indexOf('Older session');
    const newerPos = error.message.indexOf('Newer session');
    expect(olderPos).toBeLessThan(newerPos);
    // Older session should be index 1, newer should be index 2
    expect(error.message).toMatch(/1\. Older session/);
    expect(error.message).toMatch(/2\. Newer session/);
  });

  it('truncates display names longer than 60 characters', () => {
    const longName = 'A'.repeat(80);
    const sessions = [
      {
        id: 'uuid-1',
        displayName: longName,
        lastUpdated: '2024-01-01T10:00:00.000Z',
        startTime: '2024-01-01T09:00:00.000Z',
        index: 1,
      },
    ] as SessionInfo[];

    const error = SessionError.invalidSessionIdentifier('bad', sessions);
    expect(error.message).toContain('A'.repeat(57) + '...');
    expect(error.message).not.toContain(longName);
  });

  it('truncates display names with multi-byte Unicode characters without splitting them', () => {
    // Each emoji is 2 UTF-16 code units but 1 grapheme cluster.
    // Naive .slice() would split at a surrogate pair boundary; cpSlice must not.
    const emoji = '😀';
    const longName = emoji.repeat(80); // 80 grapheme clusters, 160 UTF-16 code units
    const sessions = [
      {
        id: 'uuid-1',
        displayName: longName,
        lastUpdated: '2024-01-01T10:00:00.000Z',
        startTime: '2024-01-01T09:00:00.000Z',
        index: 1,
      },
    ] as SessionInfo[];

    const error = SessionError.invalidSessionIdentifier('bad', sessions);
    // Should end with exactly 57 emojis followed by '...'
    expect(error.message).toContain(emoji.repeat(57) + '...');
    // Must not contain the full un-truncated name
    expect(error.message).not.toContain(longName);
  });

  it('appends "Run --list-sessions for the full list." when more than 10 sessions exist', () => {
    const sessions = Array.from({ length: 11 }, (_, i) => ({
      id: `uuid-${i}`,
      displayName: `Session ${i + 1}`,
      lastUpdated: `2024-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
      startTime: `2024-01-${String(i + 1).padStart(2, '0')}T09:00:00.000Z`,
      index: i + 1,
    })) as SessionInfo[];

    const error = SessionError.invalidSessionIdentifier('bad', sessions);
    expect(error.message).toContain('Run --list-sessions for the full list.');
    // Most recent 10 sessions (2–11) shown; oldest (1) is hidden behind the note
    expect(error.message).toContain('--resume 11');
    expect(error.message).not.toContain('--resume 1,');
  });

  it('does not append overflow note when sessions are exactly 10', () => {
    const sessions = Array.from({ length: 10 }, (_, i) => ({
      id: `uuid-${i}`,
      displayName: `Session ${i + 1}`,
      lastUpdated: `2024-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
      startTime: `2024-01-${String(i + 1).padStart(2, '0')}T09:00:00.000Z`,
      index: i + 1,
    })) as SessionInfo[];

    const error = SessionError.invalidSessionIdentifier('bad', sessions);
    expect(error.message).not.toContain(
      'Run --list-sessions for the full list.',
    );
  });
});

describe('SessionSelector.findSession error message', () => {
  let tmpDir: string;
  let config: Config;

  beforeEach(async () => {
    tmpDir = path.join(process.cwd(), '.tmp-test-find-session');
    await fs.mkdir(tmpDir, { recursive: true });

    config = {
      storage: {
        getProjectTempDir: () => tmpDir,
      },
      getSessionId: () => 'current-session-id',
    } as Partial<Config> as Config;
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  it('includes available sessions in error message for invalid numeric index', async () => {
    const sessionId = randomUUID();
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId.slice(0, 8)}.json`,
      ),
      JSON.stringify({
        sessionId,
        projectHash: 'test-hash',
        startTime: '2024-01-01T10:00:00.000Z',
        lastUpdated: '2024-01-01T10:30:00.000Z',
        messages: [
          {
            type: 'user',
            content: 'My only session',
            id: 'msg1',
            timestamp: '2024-01-01T10:00:00.000Z',
          },
        ],
      }),
    );

    const sessionSelector = new SessionSelector(config);

    const error = await sessionSelector
      .resolveSession('99')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SessionError);
    expect((error as SessionError).code).toBe('INVALID_SESSION_IDENTIFIER');
    expect((error as SessionError).message).toContain('"99"');
    expect((error as SessionError).message).toContain('My only session');
    expect((error as SessionError).message).toContain('--resume 1');
    expect((error as SessionError).message).toContain('--resume latest');
  });

  it('includes available sessions in error message for invalid string identifier', async () => {
    const sessionId = randomUUID();
    const chatsDir = path.join(tmpDir, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    await fs.writeFile(
      path.join(
        chatsDir,
        `${SESSION_FILE_PREFIX}2024-01-01T10-00-${sessionId.slice(0, 8)}.json`,
      ),
      JSON.stringify({
        sessionId,
        projectHash: 'test-hash',
        startTime: '2024-01-01T10:00:00.000Z',
        lastUpdated: '2024-01-01T10:30:00.000Z',
        messages: [
          {
            type: 'user',
            content: 'My only session',
            id: 'msg1',
            timestamp: '2024-01-01T10:00:00.000Z',
          },
        ],
      }),
    );

    const sessionSelector = new SessionSelector(config);

    const error = await sessionSelector
      .resolveSession('not-a-valid-uuid')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SessionError);
    expect((error as SessionError).message).toContain('"not-a-valid-uuid"');
    expect((error as SessionError).message).toContain('My only session');
  });
});
