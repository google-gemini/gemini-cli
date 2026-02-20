/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { TokenUsageIndicator } from './TokenUsageIndicator.js';
import { ToolCallDecision } from '@google/gemini-cli-core';

const mockMetrics = {
  models: {
    'gemini-3-pro-preview': {
      tokens: {
        total: 1500,
        input: 1000,
        candidates: 500,
        cached: 0,
        thoughts: 0,
        tool: 0,
        prompt: 1000,
      },
      api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
      roles: {},
    },
    'gemini-2.5-flash': {
      tokens: {
        total: 500000,
        input: 400000,
        candidates: 100000,
        cached: 0,
        thoughts: 0,
        tool: 0,
        prompt: 400000,
      },
      api: { totalRequests: 5, totalErrors: 0, totalLatencyMs: 500 },
      roles: {},
    },
  },
  tools: {
    totalCalls: 0,
    totalSuccess: 0,
    totalFail: 0,
    totalDurationMs: 0,
    totalDecisions: {
      [ToolCallDecision.ACCEPT]: 0,
      [ToolCallDecision.REJECT]: 0,
      [ToolCallDecision.MODIFY]: 0,
      [ToolCallDecision.AUTO_ACCEPT]: 0,
    },
    byName: {},
  },
  files: {
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
  },
};

describe('<TokenUsageIndicator />', () => {
  it('renders nothing when there are no active models', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <TokenUsageIndicator />,
      {
        uiState: {
          sessionStats: {
            sessionId: 'test',
            sessionStartTime: new Date(),
            lastPromptTokenCount: 0,
            promptCount: 0,
            metrics: {
              models: {},
              tools: mockMetrics.tools,
              files: mockMetrics.files,
            },
          },
        },
      },
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders token usage for active models with abbreviations', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <TokenUsageIndicator />,
      {
        uiState: {
          sessionStats: {
            sessionId: 'test',
            sessionStartTime: new Date(),
            lastPromptTokenCount: 0,
            promptCount: 0,
            metrics: mockMetrics,
          },
        },
      },
    );
    await waitUntilReady();
    const output = lastFrame();
    // gemini-2.5-flash -> 2.5F: 500K (sorted by total descending)
    // gemini-3-pro-preview -> 3P: 1.5K
    expect(output).toContain('2.5F:500K');
    expect(output).toContain('3P:1.5K');
    unmount();
  });

  it('sorts models by total usage descending', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <TokenUsageIndicator />,
      {
        uiState: {
          sessionStats: {
            sessionId: 'test',
            sessionStartTime: new Date(),
            lastPromptTokenCount: 0,
            promptCount: 0,
            metrics: mockMetrics,
          },
        },
      },
    );
    await waitUntilReady();
    const output = lastFrame();
    const posFlash = output.indexOf('2.5F');
    const posPro = output.indexOf('3P');
    expect(posFlash).toBeLessThan(posPro);
    unmount();
  });
});
