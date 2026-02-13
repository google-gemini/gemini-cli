/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Config } from '@google/gemini-cli-core';
import { listSessions, deleteSession } from './sessions.js';
import {
  SessionSelector,
  SessionError,
  type SessionInfo,
} from './sessionUtils.js';

const mocks = vi.hoisted(() => ({
  writeToStdout: vi.fn(),
  writeToStderr: vi.fn(),
  generateSummary: vi.fn().mockResolvedValue(undefined),
  listSessions: vi.fn(),
  findSession: vi.fn(),
  deleteSessionArtifacts: vi.fn(),
}));

vi.mock('./sessionUtils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sessionUtils.js')>();
  return {
    ...actual,
    SessionSelector: vi.fn(),
    formatRelativeTime: vi.fn(() => 'some time ago'),
    deleteSessionArtifacts: mocks.deleteSessionArtifacts,
  };
});

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    generateSummary: mocks.generateSummary,
    writeToStdout: mocks.writeToStdout,
    writeToStderr: mocks.writeToStderr,
  };
});

const createSession = (overrides: Partial<SessionInfo> = {}): SessionInfo => ({
  id: 'session-id',
  file: 'session-file',
  fileName: 'session-file.json',
  sessionPath: '/tmp/project/chats/session-file.json',
  projectTempDir: '/tmp/project',
  projectId: 'project',
  projectRoot: '/workspace/project',
  startTime: '2025-01-20T12:00:00.000Z',
  lastUpdated: '2025-01-20T12:00:00.000Z',
  messageCount: 5,
  displayName: 'Display title',
  sessionName: 'display-title-abc12',
  sessionNameBase: 'display-title',
  sessionNameSuffix: 'abc12',
  firstUserMessage: 'First user message',
  isCurrentSession: false,
  index: 1,
  ...overrides,
});

describe('sessions utils', () => {
  const mockConfig = {} as Config;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(SessionSelector).mockImplementation(
      () =>
        ({
          listSessions: mocks.listSessions,
          findSession: mocks.findSession,
        }) as unknown as SessionSelector,
    );
  });

  describe('listSessions', () => {
    it('prints empty message when no sessions exist', async () => {
      mocks.listSessions.mockResolvedValue([]);

      await listSessions(mockConfig);

      expect(mocks.writeToStdout).toHaveBeenCalledWith(
        'No previous sessions found.',
      );
    });

    it('prints global session list with name and project root', async () => {
      mocks.listSessions.mockResolvedValue([
        createSession({
          id: 'older',
          sessionName: 'older-chat-aaaaa',
          startTime: '2025-01-19T12:00:00.000Z',
          projectRoot: '/workspace/older',
        }),
        createSession({
          id: 'newer',
          sessionName: 'newer-chat-bbbbb',
          startTime: '2025-01-20T12:00:00.000Z',
          projectRoot: '/workspace/newer',
          isCurrentSession: true,
        }),
      ]);

      await listSessions(mockConfig);

      expect(mocks.writeToStdout).toHaveBeenCalledWith(
        '\nAvailable sessions (2):\n',
      );
      expect(mocks.writeToStdout).toHaveBeenCalledWith(
        expect.stringContaining('1. older-chat-aaaaa'),
      );
      expect(mocks.writeToStdout).toHaveBeenCalledWith(
        expect.stringContaining('/workspace/older'),
      );
      expect(mocks.writeToStdout).toHaveBeenCalledWith(
        expect.stringContaining(', current)'),
      );
    });
  });

  describe('deleteSession', () => {
    it('prints empty message when no sessions exist', async () => {
      mocks.listSessions.mockResolvedValue([]);

      await deleteSession(mockConfig, '1');

      expect(mocks.writeToStderr).toHaveBeenCalledWith('No sessions found.');
      expect(mocks.deleteSessionArtifacts).not.toHaveBeenCalled();
    });

    it('deletes a selected session and prints confirmation', async () => {
      const target = createSession({ sessionName: 'target-chat-ccccc' });
      mocks.listSessions.mockResolvedValue([target]);
      mocks.findSession.mockResolvedValue(target);

      await deleteSession(mockConfig, 'target-chat-ccccc');

      expect(mocks.findSession).toHaveBeenCalledWith('target-chat-ccccc');
      expect(mocks.deleteSessionArtifacts).toHaveBeenCalledWith(target);
      expect(mocks.writeToStdout).toHaveBeenCalledWith(
        'Deleted session: target-chat-ccccc (some time ago)',
      );
    });

    it('shows SessionError messages for invalid identifiers', async () => {
      mocks.listSessions.mockResolvedValue([createSession()]);
      mocks.findSession.mockRejectedValue(
        SessionError.invalidSessionIdentifier('bad'),
      );

      await deleteSession(mockConfig, 'bad');

      expect(mocks.writeToStderr).toHaveBeenCalledWith(
        expect.stringContaining('Invalid session identifier "bad".'),
      );
      expect(mocks.deleteSessionArtifacts).not.toHaveBeenCalled();
    });

    it('prevents deleting the current session', async () => {
      const current = createSession({
        id: 'current-session-id',
        isCurrentSession: true,
      });
      mocks.listSessions.mockResolvedValue([current]);
      mocks.findSession.mockResolvedValue(current);

      await deleteSession(mockConfig, 'current-session-id');

      expect(mocks.writeToStderr).toHaveBeenCalledWith(
        'Cannot delete the current active session.',
      );
      expect(mocks.deleteSessionArtifacts).not.toHaveBeenCalled();
    });

    it('handles deletion failures', async () => {
      const target = createSession({ sessionName: 'broken-chat-ddddd' });
      mocks.listSessions.mockResolvedValue([target]);
      mocks.findSession.mockResolvedValue(target);
      mocks.deleteSessionArtifacts.mockRejectedValue(new Error('disk failure'));

      await deleteSession(mockConfig, 'broken-chat-ddddd');

      expect(mocks.writeToStderr).toHaveBeenCalledWith(
        'Failed to delete session: disk failure',
      );
    });
  });
});
