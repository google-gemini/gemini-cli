/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionSummaryDisplay } from './SessionSummaryDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { type SessionMetrics } from '../contexts/SessionContext.js';
import {
  ToolCallDecision,
  getShellConfiguration,
  type WorktreeSettings,
} from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getShellConfiguration: vi.fn(),
  };
});

vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../contexts/SessionContext.js')>();
  return {
    ...actual,
    useSessionStats: vi.fn(),
  };
});

vi.mock('../contexts/ConfigContext.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../contexts/ConfigContext.js')>();
  return {
    ...actual,
    useConfig: vi.fn(),
  };
});

const getShellConfigurationMock = vi.mocked(getShellConfiguration);
const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);

const renderWithMockedStats = async (
  metrics: SessionMetrics,
  sessionId = 'test-session',
  worktreeSettings?: WorktreeSettings,
) => {
  useSessionStatsMock.mockReturnValue({
    stats: {
      sessionId,
      sessionStartTime: new Date(),
      metrics,
      lastPromptTokenCount: 0,
      promptCount: 5,
    },

    getPromptCount: () => 5,
    startNewPrompt: vi.fn(),
  } as unknown as ReturnType<typeof SessionContext.useSessionStats>);

  vi.mocked(useConfig).mockReturnValue({
    getWorktreeSettings: () => worktreeSettings,
  } as never);

  const result = await renderWithProviders(
    <SessionSummaryDisplay duration="1h 23m 45s" />,
    {
      width: 100,
    },
  );
  await result.waitUntilReady();
  return result;
};

describe('<SessionSummaryDisplay />', () => {
  const emptyMetrics: SessionMetrics = {
    models: {},
    tools: {
      totalCalls: 0,
      totalSuccess: 0,
      totalFail: 0,
      totalDurationMs: 0,
      totalDecisions: {
        accept: 0,
        reject: 0,
        modify: 0,
        [ToolCallDecision.AUTO_ACCEPT]: 0,
      },
      byName: {},
    },
    files: {
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
    },
  };

  beforeEach(() => {
    getShellConfigurationMock.mockReturnValue({
      executable: 'bash',
      argsPrefix: ['-c'],
      shell: 'bash',
    });
  });

  it('renders the summary display with a title', async () => {
    const metrics: SessionMetrics = {
      ...emptyMetrics,
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 10, totalErrors: 1, totalLatencyMs: 50234 },
          tokens: {
            input: 500,
            prompt: 1000,
            candidates: 2000,
            total: 3500,
            cached: 500,
            thoughts: 300,
            tool: 200,
          },
          roles: {},
        },
      },
      files: {
        totalLinesAdded: 42,
        totalLinesRemoved: 15,
      },
    };

    const { lastFrame, unmount } = await renderWithMockedStats(metrics);
    const output = lastFrame();

    expect(output).toContain('Agent powering down. Goodbye!');
    expect(output).toMatchSnapshot();
    unmount();
  });

  describe('Session ID in footer', () => {
    it('renders session ID without quotes (bash)', async () => {
      const uuidSessionId = '1234-abcd-5678-efgh';
      const { lastFrame, unmount } = await renderWithMockedStats(
        emptyMetrics,
        uuidSessionId,
      );
      const output = lastFrame();

      // Session IDs are UUIDs and should never be quoted, as quoting
      // style differences across shells (e.g., single quotes in cmd.exe)
      // cause the resume command to fail.
      expect(output).toContain('gemini --resume 1234-abcd-5678-efgh');
      unmount();
    });

    it('renders session ID without quotes (powershell)', async () => {
      getShellConfigurationMock.mockReturnValue({
        executable: 'powershell.exe',
        argsPrefix: ['-NoProfile', '-Command'],
        shell: 'powershell',
      });

      const uuidSessionId = '1234-abcd-5678-efgh';
      const { lastFrame, unmount } = await renderWithMockedStats(
        emptyMetrics,
        uuidSessionId,
      );
      const output = lastFrame();

      // Session IDs are UUIDs — no quoting needed on any shell.
      expect(output).toContain('gemini --resume 1234-abcd-5678-efgh');
      unmount();
    });

    it('renders session ID without quotes (cmd)', async () => {
      getShellConfigurationMock.mockReturnValue({
        executable: 'cmd.exe',
        argsPrefix: ['/d', '/s', '/c'],
        shell: 'cmd',
      });

      const uuidSessionId = '935c6d18-0c3f-4f42-8113-370b2daada1a';
      const { lastFrame, unmount } = await renderWithMockedStats(
        emptyMetrics,
        uuidSessionId,
      );
      const output = lastFrame();

      expect(output).toContain(
        'gemini --resume 935c6d18-0c3f-4f42-8113-370b2daada1a',
      );
      unmount();
    });

    it('safely quotes a malicious-looking session ID in the footer', async () => {
      const maliciousSessionId = "'; rm -rf / #";
      const { lastFrame, unmount } = await renderWithMockedStats(
        emptyMetrics,
        maliciousSessionId,
      );
      const output = lastFrame();

      // escapeShellArg with bash (shell-quote) keeps this payload as a
      // single shell argument instead of allowing it to break out.
      expect(output).toContain('gemini --resume "\'; rm -rf / #"');
      unmount();
    });
  });

  describe('Worktree status', () => {
    it('renders worktree instructions when worktreeSettings are present', async () => {
      const worktreeSettings: WorktreeSettings = {
        name: 'foo-bar',
        path: '/path/to/foo-bar',
        baseSha: 'base-sha',
      };

      const { lastFrame, unmount } = await renderWithMockedStats(
        emptyMetrics,
        'test-session',
        worktreeSettings,
      );
      const output = lastFrame();

      expect(output).toContain('To resume work in this worktree:');
      expect(output).toContain(
        'cd /path/to/foo-bar && gemini --resume test-session',
      );
      expect(output).toContain(
        'To remove manually: git worktree remove /path/to/foo-bar',
      );
      unmount();
    });
  });
});
