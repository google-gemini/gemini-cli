/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import * as SessionContext from '../contexts/SessionContext.js';
import type { SessionStatsState } from '../contexts/SessionContext.js';
import { Banner } from './Banner.js';
import { Footer } from './Footer.js';
import { Header } from './Header.js';
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
      ui: {
        ...original.theme.ui,
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
  it('<Header /> should not crash when theme.ui.gradient is empty', () => {
    const { lastFrame } = renderWithProviders(
      <Header version="1.0.0" nightly={false} />,
      {
        width: 120,
      },
    );
    expect(lastFrame()).toBeDefined();
  });

  it('<ModelDialog /> should not crash when theme.ui.gradient is empty', () => {
    const { lastFrame } = renderWithProviders(
      <ModelDialog onClose={() => {}} />,
      {
        width: 120,
      },
    );
    expect(lastFrame()).toBeDefined();
  });

  it('<Banner /> should not crash when theme.ui.gradient is empty', () => {
    const { lastFrame } = renderWithProviders(
      <Banner bannerText="Test Banner" isWarning={false} width={80} />,
      {
        width: 120,
      },
    );
    expect(lastFrame()).toBeDefined();
  });

  it('<Footer /> should not crash when theme.ui.gradient has only one color (or empty) and nightly is true', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
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
  });

  it('<StatsDisplay /> should not crash when theme.ui.gradient is empty', () => {
    const { lastFrame } = renderWithProviders(
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
  });
});
