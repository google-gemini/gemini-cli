/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { createMockSettings } from '../../../test-utils/settings.js';
import { Footer } from '../Footer.js';
import { ToolCallDecision } from '@google/gemini-cli-core';
import type { SessionStatsState } from '../../contexts/SessionContext.js';

const mockSessionStats: SessionStatsState = {
  sessionId: 'test-session-id-12345',
  sessionStartTime: new Date(),
  lastPromptTokenCount: 0,
  promptCount: 0,
  metrics: {
    models: {
      'gemini-pro': {
        api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 },
        tokens: {
          input: 100,
          prompt: 0,
          candidates: 50,
          total: 150,
          cached: 0,
          thoughts: 0,
          tool: 0,
        },
      },
    },
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
      totalLinesAdded: 12,
      totalLinesRemoved: 4,
    },
  },
};

describe('Footer Custom Items', () => {
  it('renders items in the specified order', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        currentModel: 'gemini-pro',
        sessionStats: mockSessionStats,
      },
      settings: createMockSettings({
        ui: {
          footer: {
            items: ['session-id', 'code-changes', 'token-count'],
          },
        },
      }),
    });

    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output).toContain('test-ses');
    expect(output).toContain('+12 -4');
    expect(output).toContain('tokens:150');

    // Check order
    const idIdx = output!.indexOf('test-ses');
    const codeIdx = output!.indexOf('+12 -4');
    const tokenIdx = output!.indexOf('tokens:150');

    expect(idIdx).toBeLessThan(codeIdx);
    expect(codeIdx).toBeLessThan(tokenIdx);
  });

  it('renders all items with dividers', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        currentModel: 'gemini-pro',
        sessionStats: mockSessionStats,
        branchName: 'main',
      },
      settings: createMockSettings({
        general: {
          vimMode: true,
        },
        ui: {
          footer: {
            items: ['vim-mode', 'cwd', 'git-branch', 'model-name'],
          },
        },
      }),
    });

    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output).toContain('|');
    expect(output!.split('|').length).toBe(4);
  });

  it('handles empty items array', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: { sessionStats: mockSessionStats },
      settings: createMockSettings({
        ui: {
          footer: {
            items: [],
          },
        },
      }),
    });

    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output!.trim()).toBe('');
  });

  it('does not render items that are conditionally hidden', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        sessionStats: mockSessionStats,
        branchName: undefined, // No branch
      },
      settings: createMockSettings({
        ui: {
          footer: {
            items: ['cwd', 'git-branch', 'model-name'],
          },
        },
      }),
    });

    const output = lastFrame();
    expect(output).toBeDefined();
    expect(output).not.toContain('('); // Branch is usually in (branch*)
    expect(output!.split('|').length).toBe(2); // Only cwd and model-name
  });
});
