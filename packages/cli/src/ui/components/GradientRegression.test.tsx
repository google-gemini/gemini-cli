/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import * as SessionContext from '../contexts/SessionContext.js';
import { type SessionStatsState } from '../contexts/SessionContext.js';
import { Banner } from './Banner.js';
import { Footer } from './Footer.js';
import { AppHeader } from './AppHeader.js';
import { ModelDialog } from './ModelDialog.js';
import { StatsDisplay } from './StatsDisplay.js';

// Mock the theme module
vi.mock('../semantic-colors.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../semantic-colors.js')>();
  return {
    ...original,
    theme: {
      ...original.theme,
      background: {
        ...original.theme.background,
        focus: '#004000',
      },
      ui: {
        ...original.theme.ui,
        focus: '#00ff00',
        gradient: [], // Empty array to potentially trigger the crash
      },
    },
  };
});

// Mock the context to provide controlled data for testing
vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContext>();
  return {
    ...actual,
    useSessionStats: vi.fn(),
  };
});

const mockSessionStats: SessionStatsState = {
  sessionId: 'test-session',
  sessionStartTime: new Date(),
  lastPromptTokenCount: 0,
  promptCount: 0,
  metrics: {
    models: {},
    tools: {
      totalCalls: 0,
      totalSuccess: 0,
      totalFail: 0,
      totalDurationMs: 0,
      totalDecisions: { accept: 0, reject: 0, modify: 0, auto_accept: 0 },
      byName: {},
    },
    files: { totalLinesAdded: 0, totalLinesRemoved: 0 },
  },
};

const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);
useSessionStatsMock.mockReturnValue({
  stats: mockSessionStats,
  getPromptCount: () => 0,
  startNewPrompt: vi.fn(),
});

describe('Gradient Crash Regression Tests', () => {
  it('<AppHeader /> should not crash when theme.ui.gradient is empty', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <AppHeader version="1.0.0" />,
      {
        width: 120,
      },
    );
    expect(lastFrame()).toBeDefined();
    unmount();
  });

  it('<ModelDialog /> should not crash when theme.ui.gradient is empty', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <ModelDialog onClose={async () => {}} />,
      {
        width: 120,
      },
    );
    expect(lastFrame()).toBeDefined();
    unmount();
  });

  it('<Banner /> should not crash when theme.ui.gradient is empty', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <Banner bannerText="Test Banner" isWarning={false} width={80} />,
      {
        width: 120,
      },
    );
    expect(lastFrame()).toBeDefined();
    unmount();
  });

  it('<Footer /> should not crash when theme.ui.gradient has only one color (or empty) and nightly is true', async () => {
    const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        nightly: true, // Enable nightly to trigger Gradient usage logic
        sessionStats: mockSessionStats,
      },
    });
    // If it crashes, this line won't be reached or lastFrame() will throw
    expect(lastFrame()).toBeDefined();
    // It should fall back to rendering text without gradient
    expect(lastFrame()).not.toContain('Gradient');
    unmount();
  });

  it('<StatsDisplay /> should not crash when theme.ui.gradient is empty', async () => {
    const { lastFrame, unmount } = await renderWithProviders(
      <StatsDisplay duration="1s" title="My Stats" />,
      {
        width: 120,
        uiState: {
          sessionStats: mockSessionStats,
        },
      },
    );
    expect(lastFrame()).toBeDefined();
    // Ensure title is rendered
    expect(lastFrame()).toContain('My Stats');
    unmount();
  });
});
