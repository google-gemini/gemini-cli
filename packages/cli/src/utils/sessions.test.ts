/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deleteStoredSession, type Config } from '@google/gemini-cli-core';
import { listSessions, listAllSessions, deleteSession } from './sessions.js';
import {
  SessionSelector,
  type SessionInfo,
  getSessionFiles,
} from './sessionUtils.js';

const mocks = vi.hoisted(() => ({
  writeToStdout: vi.fn(),
  writeToStderr: vi.fn(),
  mockGetProjects: vi.fn(),
  mockInitialize: vi.fn(),
}));

// Mock the SessionSelector and deleteStoredSession.
vi.mock('./sessionUtils.js', () => ({
  SessionSelector: vi.fn(),
  formatRelativeTime: vi.fn(() => 'some time ago'),
  getSessionFiles: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');

  const MockProjectRegistry = vi.fn().mockImplementation(() => ({
    initialize: mocks.mockInitialize,
    getProjects: mocks.mockGetProjects,
  }));

  return {
    ...actual,
    deleteStoredSession: vi.fn(),
    generateSummary: vi.fn().mockResolvedValue(undefined),
    writeToStdout: mocks.writeToStdout,
    writeToStderr: mocks.writeToStderr,
    ProjectRegistry: MockProjectRegistry,
  };
});

describe('listSessions', () => {
  let mockConfig: Config;
  let mockListSessions: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create mock config
    mockConfig = {
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/test-project'),
      },
      getSessionId: vi.fn().mockReturnValue('current-session-id'),
    } as unknown as Config;

    // Create mock listSessions method
    mockListSessions = vi.fn();

    // Mock SessionSelector constructor to return object with listSessions method
    vi.mocked(SessionSelector).mockImplementation(
      () =>
        ({
          listSessions: mockListSessions,
        }) as unknown as InstanceType<typeof SessionSelector>,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    mocks.writeToStdout.mockClear();
    mocks.writeToStderr.mockClear();
  });

  it('should display message when no previous sessions were found', async () => {
    // Arrange: Return empty array from listSessions
    mockListSessions.mockResolvedValue([]);

    // Act
    await listSessions(mockConfig);

    // Assert
    expect(mockListSessions).toHaveBeenCalledOnce();
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      'No previous sessions found for this project.',
    );
  });

  it('should list sessions when sessions are found', async () => {
    // Arrange: Create test sessions
    const now = new Date('2025-01-20T12:00:00.000Z');
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const mockSessions: SessionInfo[] = [
      {
        id: 'session-1',
        file: 'session-2025-01-18T12-00-00-session-1',
        fileName: 'session-2025-01-18T12-00-00-session-1.json',
        startTime: twoDaysAgo.toISOString(),
        lastUpdated: twoDaysAgo.toISOString(),
        messageCount: 5,
        displayName: 'First user message',
        firstUserMessage: 'First user message',
        isCurrentSession: false,
        index: 1,
      },
      {
        id: 'session-2',
        file: 'session-2025-01-20T11-00-00-session-2',
        fileName: 'session-2025-01-20T11-00-00-session-2.json',
        startTime: oneHourAgo.toISOString(),
        lastUpdated: oneHourAgo.toISOString(),
        messageCount: 10,
        displayName: 'Second user message',
        firstUserMessage: 'Second user message',
        isCurrentSession: false,
        index: 2,
      },
      {
        id: 'current-session-id',
        file: 'session-2025-01-20T12-00-00-current-s',
        fileName: 'session-2025-01-20T12-00-00-current-s.json',
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
        messageCount: 3,
        displayName: 'Current session',
        firstUserMessage: 'Current session',
        isCurrentSession: true,
        index: 3,
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);

    // Act
    await listSessions(mockConfig);

    // Assert
    expect(mockListSessions).toHaveBeenCalledOnce();

    // Check that the header was displayed
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      '\nAvailable sessions for this project (3):\n',
    );

    // Check that each session was logged
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining('1. First user message'),
    );
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining('[session-1]'),
    );

    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining('2. Second user message'),
    );
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining('[session-2]'),
    );

    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining('3. Current session'),
    );
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining(', current)'),
    );
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining('[current-session-id]'),
    );
  });

  it('should sort sessions by start time (oldest first)', async () => {
    // Arrange: Create sessions in non-chronological order
    const session1Time = new Date('2025-01-18T12:00:00.000Z');
    const session2Time = new Date('2025-01-19T12:00:00.000Z');
    const session3Time = new Date('2025-01-20T12:00:00.000Z');

    const mockSessions: SessionInfo[] = [
      {
        id: 'session-2',
        file: 'session-2',
        fileName: 'session-2.json',
        startTime: session2Time.toISOString(), // Middle
        lastUpdated: session2Time.toISOString(),
        messageCount: 5,
        displayName: 'Middle session',
        firstUserMessage: 'Middle session',
        isCurrentSession: false,
        index: 2,
      },
      {
        id: 'session-1',
        file: 'session-1',
        fileName: 'session-1.json',
        startTime: session1Time.toISOString(), // Oldest
        lastUpdated: session1Time.toISOString(),
        messageCount: 5,
        displayName: 'Oldest session',
        firstUserMessage: 'Oldest session',
        isCurrentSession: false,
        index: 1,
      },
      {
        id: 'session-3',
        file: 'session-3',
        fileName: 'session-3.json',
        startTime: session3Time.toISOString(), // Newest
        lastUpdated: session3Time.toISOString(),
        messageCount: 5,
        displayName: 'Newest session',
        firstUserMessage: 'Newest session',
        isCurrentSession: false,
        index: 3,
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);

    // Act
    await listSessions(mockConfig);

    // Assert
    // Get all the session log calls (skip the header)
    const sessionCalls = mocks.writeToStdout.mock.calls.filter(
      (call): call is [string] =>
        // eslint-disable-next-line no-restricted-syntax
        typeof call[0] === 'string' &&
        call[0].includes('[session-') &&
        !call[0].includes('Available sessions'),
    );

    // Verify they are sorted by start time (oldest first)
    expect(sessionCalls[0][0]).toContain('1. Oldest session');
    expect(sessionCalls[1][0]).toContain('2. Middle session');
    expect(sessionCalls[2][0]).toContain('3. Newest session');
  });

  it('should format session output with relative time and session ID', async () => {
    // Arrange
    const now = new Date('2025-01-20T12:00:00.000Z');
    const mockSessions: SessionInfo[] = [
      {
        id: 'abc123def456',
        file: 'session-file',
        fileName: 'session-file.json',
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
        messageCount: 5,
        displayName: 'Test message',
        firstUserMessage: 'Test message',
        isCurrentSession: false,
        index: 1,
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);

    // Act
    await listSessions(mockConfig);

    // Assert
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining('1. Test message'),
    );
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining('some time ago'),
    );
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining('[abc123def456]'),
    );
  });

  it('should handle single session', async () => {
    // Arrange
    const now = new Date('2025-01-20T12:00:00.000Z');
    const mockSessions: SessionInfo[] = [
      {
        id: 'single-session',
        file: 'session-file',
        fileName: 'session-file.json',
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
        messageCount: 5,
        displayName: 'Only session',
        firstUserMessage: 'Only session',
        isCurrentSession: true,
        index: 1,
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);

    // Act
    await listSessions(mockConfig);

    // Assert
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      '\nAvailable sessions for this project (1):\n',
    );
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining('1. Only session'),
    );
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining(', current)'),
    );
  });

  it('should display summary as title when available instead of first user message', async () => {
    // Arrange
    const now = new Date('2025-01-20T12:00:00.000Z');
    const mockSessions: SessionInfo[] = [
      {
        id: 'session-with-summary',
        file: 'session-file',
        fileName: 'session-file.json',
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
        messageCount: 10,
        displayName: 'Add dark mode to the app', // Summary
        firstUserMessage:
          'How do I add dark mode to my React application with CSS variables?',
        isCurrentSession: false,
        index: 1,
        summary: 'Add dark mode to the app',
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);

    // Act
    await listSessions(mockConfig);

    // Assert: Should show the summary (displayName), not the first user message
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining('1. Add dark mode to the app'),
    );
    expect(mocks.writeToStdout).not.toHaveBeenCalledWith(
      expect.stringContaining('How do I add dark mode to my React application'),
    );
  });
});

describe('deleteSession', () => {
  let mockConfig: Config;
  let mockListSessions: ReturnType<typeof vi.fn>;
  let mockDeleteSession: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create mock config
    mockConfig = {
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/test-project'),
      },
      getSessionId: vi.fn().mockReturnValue('current-session-id'),
    } as unknown as Config;

    // Create mock methods
    mockListSessions = vi.fn();
    mockDeleteSession = vi.mocked(deleteStoredSession);
    mockDeleteSession.mockReset();

    // Mock SessionSelector constructor
    vi.mocked(SessionSelector).mockImplementation(
      () =>
        ({
          listSessions: mockListSessions,
        }) as unknown as InstanceType<typeof SessionSelector>,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should display error when no sessions are found', async () => {
    // Arrange
    mockListSessions.mockResolvedValue([]);

    // Act
    await deleteSession(mockConfig, '1');

    // Assert
    expect(mockListSessions).toHaveBeenCalledOnce();
    expect(mocks.writeToStderr).toHaveBeenCalledWith(
      'No sessions found for this project.',
    );
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it('should delete session by UUID', async () => {
    // Arrange
    const now = new Date('2025-01-20T12:00:00.000Z');
    const mockSessions: SessionInfo[] = [
      {
        id: 'session-uuid-123',
        file: 'session-file-123',
        fileName: 'session-file-123.json',
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
        messageCount: 5,
        displayName: 'Test session',
        firstUserMessage: 'Test session',
        isCurrentSession: false,
        index: 1,
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);
    mockDeleteSession.mockImplementation(() => {});

    // Act
    await deleteSession(mockConfig, 'session-uuid-123');

    // Assert
    expect(mockListSessions).toHaveBeenCalledOnce();
    expect(mockDeleteSession).toHaveBeenCalledWith(
      mockConfig,
      'session-file-123',
    );
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      'Deleted session 1: Test session (some time ago)',
    );
    expect(mocks.writeToStderr).not.toHaveBeenCalled();
  });

  it('should delete session by index', async () => {
    // Arrange
    const now = new Date('2025-01-20T12:00:00.000Z');
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const mockSessions: SessionInfo[] = [
      {
        id: 'session-1',
        file: 'session-file-1',
        fileName: 'session-file-1.json',
        startTime: oneHourAgo.toISOString(),
        lastUpdated: oneHourAgo.toISOString(),
        messageCount: 5,
        displayName: 'First session',
        firstUserMessage: 'First session',
        isCurrentSession: false,
        index: 1,
      },
      {
        id: 'session-2',
        file: 'session-file-2',
        fileName: 'session-file-2.json',
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
        messageCount: 10,
        displayName: 'Second session',
        firstUserMessage: 'Second session',
        isCurrentSession: false,
        index: 2,
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);
    mockDeleteSession.mockImplementation(() => {});

    // Act
    await deleteSession(mockConfig, '2');

    // Assert
    expect(mockListSessions).toHaveBeenCalledOnce();
    expect(mockDeleteSession).toHaveBeenCalledWith(
      mockConfig,
      'session-file-2',
    );
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      'Deleted session 2: Second session (some time ago)',
    );
  });

  it('should display error for invalid session identifier (non-numeric)', async () => {
    // Arrange
    const now = new Date('2025-01-20T12:00:00.000Z');
    const mockSessions: SessionInfo[] = [
      {
        id: 'session-1',
        file: 'session-file-1',
        fileName: 'session-file-1.json',
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
        messageCount: 5,
        displayName: 'Test session',
        firstUserMessage: 'Test session',
        isCurrentSession: false,
        index: 1,
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);

    // Act
    await deleteSession(mockConfig, 'invalid-id');

    // Assert
    expect(mocks.writeToStderr).toHaveBeenCalledWith(
      'Invalid session identifier "invalid-id". Use --list-sessions to see available sessions.',
    );
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it('should display error for invalid session identifier (out of range)', async () => {
    // Arrange
    const now = new Date('2025-01-20T12:00:00.000Z');
    const mockSessions: SessionInfo[] = [
      {
        id: 'session-1',
        file: 'session-file-1',
        fileName: 'session-file-1.json',
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
        messageCount: 5,
        displayName: 'Test session',
        firstUserMessage: 'Test session',
        isCurrentSession: false,
        index: 1,
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);

    // Act
    await deleteSession(mockConfig, '999');

    // Assert
    expect(mocks.writeToStderr).toHaveBeenCalledWith(
      'Invalid session identifier "999". Use --list-sessions to see available sessions.',
    );
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it('should display error for invalid session identifier (zero)', async () => {
    // Arrange
    const now = new Date('2025-01-20T12:00:00.000Z');
    const mockSessions: SessionInfo[] = [
      {
        id: 'session-1',
        file: 'session-file-1',
        fileName: 'session-file-1.json',
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
        messageCount: 5,
        displayName: 'Test session',
        firstUserMessage: 'Test session',
        isCurrentSession: false,
        index: 1,
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);

    // Act
    await deleteSession(mockConfig, '0');

    // Assert
    expect(mocks.writeToStderr).toHaveBeenCalledWith(
      'Invalid session identifier "0". Use --list-sessions to see available sessions.',
    );
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it('should prevent deletion of current session', async () => {
    // Arrange
    const now = new Date('2025-01-20T12:00:00.000Z');
    const mockSessions: SessionInfo[] = [
      {
        id: 'current-session-id',
        file: 'current-session-file',
        fileName: 'current-session-file.json',
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
        messageCount: 5,
        displayName: 'Current session',
        firstUserMessage: 'Current session',
        isCurrentSession: true,
        index: 1,
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);

    // Act - try to delete by index
    await deleteSession(mockConfig, '1');

    // Assert
    expect(mocks.writeToStderr).toHaveBeenCalledWith(
      'Cannot delete the current active session.',
    );
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it('should prevent deletion of current session by UUID', async () => {
    // Arrange
    const now = new Date('2025-01-20T12:00:00.000Z');
    const mockSessions: SessionInfo[] = [
      {
        id: 'current-session-id',
        file: 'current-session-file',
        fileName: 'current-session-file.json',
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
        messageCount: 5,
        displayName: 'Current session',
        firstUserMessage: 'Current session',
        isCurrentSession: true,
        index: 1,
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);

    // Act - try to delete by UUID
    await deleteSession(mockConfig, 'current-session-id');

    // Assert
    expect(mocks.writeToStderr).toHaveBeenCalledWith(
      'Cannot delete the current active session.',
    );
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it('should handle deletion errors gracefully', async () => {
    // Arrange
    const now = new Date('2025-01-20T12:00:00.000Z');
    const mockSessions: SessionInfo[] = [
      {
        id: 'session-1',
        file: 'session-file-1',
        fileName: 'session-file-1.json',
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
        messageCount: 5,
        displayName: 'Test session',
        firstUserMessage: 'Test session',
        isCurrentSession: false,
        index: 1,
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);
    mockDeleteSession.mockImplementation(() => {
      throw new Error('File deletion failed');
    });

    // Act
    await deleteSession(mockConfig, '1');

    // Assert
    expect(mockDeleteSession).toHaveBeenCalledWith(
      mockConfig,
      'session-file-1',
    );
    expect(mocks.writeToStderr).toHaveBeenCalledWith(
      'Failed to delete session: File deletion failed',
    );
  });

  it('should handle non-Error deletion failures', async () => {
    // Arrange
    const now = new Date('2025-01-20T12:00:00.000Z');
    const mockSessions: SessionInfo[] = [
      {
        id: 'session-1',
        file: 'session-file-1',
        fileName: 'session-file-1.json',
        startTime: now.toISOString(),
        lastUpdated: now.toISOString(),
        messageCount: 5,
        displayName: 'Test session',
        firstUserMessage: 'Test session',
        isCurrentSession: false,
        index: 1,
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);
    mockDeleteSession.mockImplementation(() => {
      // eslint-disable-next-line no-restricted-syntax
      throw 'Unknown error type';
    });

    // Act
    await deleteSession(mockConfig, '1');

    // Assert
    expect(mocks.writeToStderr).toHaveBeenCalledWith(
      'Failed to delete session: Unknown error',
    );
  });

  it('should sort sessions before finding by index', async () => {
    // Arrange: Create sessions in non-chronological order
    const session1Time = new Date('2025-01-18T12:00:00.000Z');
    const session2Time = new Date('2025-01-19T12:00:00.000Z');
    const session3Time = new Date('2025-01-20T12:00:00.000Z');

    const mockSessions: SessionInfo[] = [
      {
        id: 'session-3',
        file: 'session-file-3',
        fileName: 'session-file-3.json',
        startTime: session3Time.toISOString(), // Newest
        lastUpdated: session3Time.toISOString(),
        messageCount: 5,
        displayName: 'Newest session',
        firstUserMessage: 'Newest session',
        isCurrentSession: false,
        index: 3,
      },
      {
        id: 'session-1',
        file: 'session-file-1',
        fileName: 'session-file-1.json',
        startTime: session1Time.toISOString(), // Oldest
        lastUpdated: session1Time.toISOString(),
        messageCount: 5,
        displayName: 'Oldest session',
        firstUserMessage: 'Oldest session',
        isCurrentSession: false,
        index: 1,
      },
      {
        id: 'session-2',
        file: 'session-file-2',
        fileName: 'session-file-2.json',
        startTime: session2Time.toISOString(), // Middle
        lastUpdated: session2Time.toISOString(),
        messageCount: 5,
        displayName: 'Middle session',
        firstUserMessage: 'Middle session',
        isCurrentSession: false,
        index: 2,
      },
    ];

    mockListSessions.mockResolvedValue(mockSessions);
    mockDeleteSession.mockImplementation(() => {});

    // Act - delete index 1 (should be oldest session after sorting)
    await deleteSession(mockConfig, '1');

    // Assert
    expect(mockDeleteSession).toHaveBeenCalledWith(
      mockConfig,
      'session-file-1',
    );
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining('Oldest session'),
    );
  });
});

describe('listAllSessions', () => {
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      storage: {
        getProjectRoot: vi
          .fn()
          .mockReturnValue('/home/user/workspace/gemini-cli'),
      },
      getSessionId: vi.fn().mockReturnValue('current-session-id'),
      getGroupByWorkspace: vi.fn().mockReturnValue(false),
    } as unknown as Config;
  });

  afterEach(() => {
    vi.clearAllMocks();
    mocks.writeToStdout.mockClear();
    mocks.writeToStderr.mockClear();
    mocks.mockGetProjects.mockReset();
    mocks.mockInitialize.mockReset();
    vi.mocked(getSessionFiles).mockReset();
  });

  it('should print message when no workspaces are found', async () => {
    mocks.mockInitialize.mockResolvedValue(undefined);
    mocks.mockGetProjects.mockReturnValue({});

    await listAllSessions(mockConfig);

    expect(mocks.mockInitialize).toHaveBeenCalledOnce();
    expect(mocks.mockGetProjects).toHaveBeenCalledOnce();
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining('No workspaces found in the project registry.'),
    );
  });

  it('should print message when workspaces exist but none have sessions', async () => {
    mocks.mockInitialize.mockResolvedValue(undefined);
    mocks.mockGetProjects.mockReturnValue({
      '/home/user/workspace/gemini-cli': 'gemini-cli',
    });
    vi.mocked(getSessionFiles).mockResolvedValue([]);

    await listAllSessions(mockConfig);

    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining(
        'No previous sessions found across any workspaces.',
      ),
    );
  });

  it('should list flat global chronological sessions across workspaces', async () => {
    mocks.mockInitialize.mockResolvedValue(undefined);
    mocks.mockGetProjects.mockReturnValue({
      '/home/user/workspace/gemini-cli': 'gemini-cli',
      '/home/user/workspace/another-project': 'another-project',
    });

    const mockCliSessions: SessionInfo[] = [
      {
        id: 'current-session-id',
        file: 'session-file-2',
        fileName: 'session-file-2.json',
        startTime: '2025-01-20T11:00:00.000Z',
        lastUpdated: '2025-01-20T11:00:00.000Z',
        messageCount: 5,
        displayName: 'Active session',
        firstUserMessage: 'Active message',
        isCurrentSession: true,
        index: 2,
      },
    ];

    const mockAnotherSessions: SessionInfo[] = [
      {
        id: 'session-1',
        file: 'session-file-1',
        fileName: 'session-file-1.json',
        startTime: '2025-01-20T10:00:00.000Z',
        lastUpdated: '2025-01-20T10:00:00.000Z',
        messageCount: 3,
        displayName: 'First session',
        firstUserMessage: 'First message',
        isCurrentSession: false,
        index: 1,
      },
    ];

    vi.mocked(getSessionFiles).mockImplementation(async (chatsDir) => {
      if (chatsDir.includes('gemini-cli')) {
        return mockCliSessions;
      }
      if (chatsDir.includes('another-project')) {
        return mockAnotherSessions;
      }
      return [];
    });

    await listAllSessions(mockConfig);

    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining('Latest Sessions Across All Workspaces:'),
    );

    // Verify they are sorted newest first
    const sessionCalls = mocks.writeToStdout.mock.calls.filter(
      (call): call is [string] => {
        const firstArg = call[0];
        return (
          typeof firstArg === 'string' &&
          (firstArg.includes('Active session') ||
            firstArg.includes('First session'))
        );
      },
    );
    // 1. Active session (newest) - should have '*' since it is the active workspace
    expect(sessionCalls[0][0]).toContain('* 1. Active session [gemini-cli]');
    // 2. First session (older) - should have ' ' since it belongs to another-project
    expect(sessionCalls[1][0]).toContain(
      '  2. First session [another-project]',
    );
  });

  it('should list grouped sessions of workspaces when getGroupByWorkspace() is true', async () => {
    mockConfig = {
      storage: {
        getProjectRoot: vi
          .fn()
          .mockReturnValue('/home/user/workspace/gemini-cli'),
      },
      getSessionId: vi.fn().mockReturnValue('current-session-id'),
      getGroupByWorkspace: vi.fn().mockReturnValue(true),
    } as unknown as Config;

    mocks.mockInitialize.mockResolvedValue(undefined);
    mocks.mockGetProjects.mockReturnValue({
      '/home/user/workspace/gemini-cli': 'gemini-cli',
      '/home/user/workspace/another-project': 'another-project',
    });

    const mockCliSessions: SessionInfo[] = [
      {
        id: 'current-session-id',
        file: 'session-file-2',
        fileName: 'session-file-2.json',
        startTime: '2025-01-20T11:00:00.000Z',
        lastUpdated: '2025-01-20T11:00:00.000Z',
        messageCount: 5,
        displayName: 'Active session',
        firstUserMessage: 'Active message',
        isCurrentSession: true,
        index: 2,
      },
    ];

    const mockAnotherSessions: SessionInfo[] = [
      {
        id: 'session-1',
        file: 'session-file-1',
        fileName: 'session-file-1.json',
        startTime: '2025-01-20T10:00:00.000Z',
        lastUpdated: '2025-01-20T10:00:00.000Z',
        messageCount: 3,
        displayName: 'First session',
        firstUserMessage: 'First message',
        isCurrentSession: false,
        index: 1,
      },
    ];

    vi.mocked(getSessionFiles).mockImplementation(async (chatsDir) => {
      if (chatsDir.includes('gemini-cli')) {
        return mockCliSessions;
      }
      if (chatsDir.includes('another-project')) {
        return mockAnotherSessions;
      }
      return [];
    });

    await listAllSessions(mockConfig);

    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining(
        'Workspace: /home/user/workspace/gemini-cli (active)',
      ),
    );
    expect(mocks.writeToStdout).toHaveBeenCalledWith(
      expect.stringContaining(
        'Workspace: /home/user/workspace/another-project',
      ),
    );
  });
});
