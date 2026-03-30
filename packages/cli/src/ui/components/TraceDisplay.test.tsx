/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../test-utils/render.js';
import { ToolCallDecision } from '@google/gemini-cli-core';
import { TraceDisplay } from './TraceDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import * as SessionTraceContext from '../contexts/SessionTraceContext.js';

vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContext>();
  return {
    ...actual,
    useSessionStats: vi.fn(),
  };
});

vi.mock('../contexts/SessionTraceContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionTraceContext>();
  return {
    ...actual,
    useSessionTrace: vi.fn(),
  };
});

const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);
const useSessionTraceMock = vi.mocked(SessionTraceContext.useSessionTrace);

describe('<TraceDisplay />', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T12:00:05.000Z'));
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 180 * 1024 * 1024,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders a graceful empty state when no trace data exists', async () => {
    useSessionStatsMock.mockReturnValue({
      stats: {
        sessionId: 'session-1',
        sessionStartTime: new Date('2026-03-30T12:00:00.000Z'),
        metrics: {
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
        },
        lastPromptTokenCount: 0,
        promptCount: 0,
      },
      startNewPrompt: vi.fn(),
      getPromptCount: vi.fn().mockReturnValue(0),
    });
    useSessionTraceMock.mockReturnValue({
      trace: { steps: {} },
      recordStep: vi.fn(),
    });

    const { lastFrame, unmount } = await render(<TraceDisplay />);

    expect(lastFrame()).toContain('Agent Execution Inspector');
    expect(lastFrame()).toContain('No traced execution yet');
    expect(lastFrame()).toContain('/trace');
    unmount();
  });

  it('renders a concise execution summary from session metrics and trace steps', async () => {
    useSessionStatsMock.mockReturnValue({
      stats: {
        sessionId: 'session-2',
        sessionStartTime: new Date('2026-03-30T12:00:00.000Z'),
        metrics: {
          models: {
            'gemini-2.5-pro': {
              api: {
                totalRequests: 2,
                totalErrors: 0,
                totalLatencyMs: 2400,
              },
              tokens: {
                input: 1200,
                prompt: 1400,
                candidates: 600,
                total: 2000,
                cached: 200,
                thoughts: 0,
                tool: 0,
              },
              roles: {},
            },
          },
          tools: {
            totalCalls: 3,
            totalSuccess: 3,
            totalFail: 0,
            totalDurationMs: 3200,
            totalDecisions: {
              accept: 1,
              reject: 0,
              modify: 0,
              [ToolCallDecision.AUTO_ACCEPT]: 0,
            },
            byName: {
              read_file: {
                count: 2,
                success: 2,
                fail: 0,
                durationMs: 2200,
                decisions: {
                  accept: 1,
                  reject: 0,
                  modify: 0,
                  [ToolCallDecision.AUTO_ACCEPT]: 0,
                },
              },
              grep: {
                count: 1,
                success: 1,
                fail: 0,
                durationMs: 1000,
                decisions: {
                  accept: 0,
                  reject: 0,
                  modify: 0,
                  [ToolCallDecision.AUTO_ACCEPT]: 0,
                },
              },
            },
          },
          files: {
            totalLinesAdded: 10,
            totalLinesRemoved: 2,
          },
        },
        lastPromptTokenCount: 0,
        promptCount: 2,
      },
      startNewPrompt: vi.fn(),
      getPromptCount: vi.fn().mockReturnValue(2),
    });
    useSessionTraceMock.mockReturnValue({
      trace: {
        steps: {
          [SessionTraceContext.SessionTraceStepKey.AgentTurn]: {
            key: SessionTraceContext.SessionTraceStepKey.AgentTurn,
            label: 'Agent turn',
            count: 2,
            totalDurationMs: 4300,
            maxDurationMs: 2600,
            lastDurationMs: 1700,
          },
          [SessionTraceContext.SessionTraceStepKey.SlashCommand]: {
            key: SessionTraceContext.SessionTraceStepKey.SlashCommand,
            label: 'Slash command',
            count: 1,
            totalDurationMs: 300,
            maxDurationMs: 300,
            lastDurationMs: 300,
          },
        },
      },
      recordStep: vi.fn(),
    });

    const { lastFrame, unmount } = await render(<TraceDisplay />);

    const output = lastFrame();
    expect(output).toContain('Prompts Sent');
    expect(output).toContain('Memory RSS');
    expect(output).toContain('Bottleneck');
    expect(output).toContain('Tool execution');
    expect(output).toContain('read_file');
    expect(output).toContain('gemini-2.5-pro');
    unmount();
  });
});
