/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { createMockSettings } from '../../test-utils/settings.js';
import { Footer } from './Footer.js';
import { tildeifyPath, ToolCallDecision } from '@google/gemini-cli-core';
import type { SessionStatsState } from '../contexts/SessionContext.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    shortenPath: (p: string, len: number) => {
      if (p.length > len) {
        return '...' + p.slice(p.length - len + 3);
      }
      return p;
    },
  };
});

const defaultProps = {
  model: 'gemini-pro',
  targetDir:
    '/Users/test/project/foo/bar/and/some/more/directories/to/make/it/long',
  branchName: 'main',
};

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
};

describe('<Footer />', () => {
  it('renders the component', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Footer />,
      {
        width: 120,
        uiState: {
          branchName: defaultProps.branchName,
          sessionStats: mockSessionStats,
        },
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toBeDefined();
    unmount();
  });

  describe('path display', () => {
    it('should display a shortened path on a narrow terminal', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 79,
          uiState: { sessionStats: mockSessionStats },
        },
      );
      await waitUntilReady();
      const tildePath = tildeifyPath(defaultProps.targetDir);
      const pathLength = Math.max(20, Math.floor(79 * 0.25));
      const expectedPath =
        '...' + tildePath.slice(tildePath.length - pathLength + 3);
      expect(lastFrame()).toContain(expectedPath);
      unmount();
    });

    it('should use wide layout at 80 columns', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 80,
          uiState: { sessionStats: mockSessionStats },
        },
      );
      await waitUntilReady();
      const tildePath = tildeifyPath(defaultProps.targetDir);
      const expectedPath =
        '...' + tildePath.slice(tildePath.length - 80 * 0.25 + 3);
      expect(lastFrame()).toContain(expectedPath);
      unmount();
    });
  });

  it('displays the branch name when provided', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Footer />,
      {
        width: 120,
        uiState: {
          branchName: defaultProps.branchName,
          sessionStats: mockSessionStats,
        },
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toContain(`(${defaultProps.branchName}*)`);
    unmount();
  });

  it('does not display the branch name when not provided', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Footer />,
      {
        width: 120,
        uiState: { branchName: undefined, sessionStats: mockSessionStats },
      },
    );
    await waitUntilReady();
    expect(lastFrame()).not.toContain(`(${defaultProps.branchName}*)`);
    unmount();
  });

  it('displays the model name and context percentage', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Footer />,
      {
        width: 120,
        uiState: { sessionStats: mockSessionStats },
        settings: createMockSettings({
          ui: {
            footer: {
              hideContextPercentage: false,
            },
          },
        }),
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toContain(defaultProps.model);
    expect(lastFrame()).toMatch(/\d+% context left/);
    unmount();
  });

  it('displays the usage indicator when usage is low', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Footer />,
      {
        width: 120,
        uiState: {
          sessionStats: mockSessionStats,
          quota: {
            userTier: undefined,
            stats: {
              remaining: 15,
              limit: 100,
              resetTime: undefined,
            },
            proQuotaRequest: null,
            validationRequest: null,
          },
        },
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('15%');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('hides the usage indicator when usage is not near limit', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Footer />,
      {
        width: 120,
        uiState: {
          sessionStats: mockSessionStats,
          quota: {
            userTier: undefined,
            stats: {
              remaining: 85,
              limit: 100,
              resetTime: undefined,
            },
            proQuotaRequest: null,
            validationRequest: null,
          },
        },
      },
    );
    await waitUntilReady();
    expect(lastFrame()).not.toContain('Usage remaining');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('displays "Limit reached" message when remaining is 0', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Footer />,
      {
        width: 120,
        uiState: {
          sessionStats: mockSessionStats,
          quota: {
            userTier: undefined,
            stats: {
              remaining: 0,
              limit: 100,
              resetTime: undefined,
            },
            proQuotaRequest: null,
            validationRequest: null,
          },
        },
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Limit reached');
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('displays the model name and abbreviated context percentage', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Footer />,
      {
        width: 99,
        uiState: { sessionStats: mockSessionStats },
        settings: createMockSettings({
          ui: {
            footer: {
              hideContextPercentage: false,
            },
          },
        }),
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toContain(defaultProps.model);
    expect(lastFrame()).toMatch(/\d+%/);
    unmount();
  });

  describe('sandbox and trust info', () => {
    it('should display untrusted when isTrustedFolder is false', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 120,
          uiState: { isTrustedFolder: false, sessionStats: mockSessionStats },
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toContain('untrusted');
      unmount();
    });

    it('should display custom sandbox info when SANDBOX env is set', async () => {
      vi.stubEnv('SANDBOX', 'gemini-cli-test-sandbox');
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 120,
          uiState: {
            isTrustedFolder: undefined,
            sessionStats: mockSessionStats,
          },
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toContain('test');
      vi.unstubAllEnvs();
      unmount();
    });

    it('should display macOS Seatbelt info when SANDBOX is sandbox-exec', async () => {
      vi.stubEnv('SANDBOX', 'sandbox-exec');
      vi.stubEnv('SEATBELT_PROFILE', 'test-profile');
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 120,
          uiState: { isTrustedFolder: true, sessionStats: mockSessionStats },
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toMatch(/macOS Seatbelt.*\(test-profile\)/s);
      vi.unstubAllEnvs();
      unmount();
    });

    it('should display "no sandbox" when SANDBOX is not set and folder is trusted', async () => {
      // Clear any SANDBOX env var that might be set.
      vi.stubEnv('SANDBOX', '');
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 120,
          uiState: { isTrustedFolder: true, sessionStats: mockSessionStats },
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toContain('no sandbox');
      vi.unstubAllEnvs();
      unmount();
    });

    it('should prioritize untrusted message over sandbox info', async () => {
      vi.stubEnv('SANDBOX', 'gemini-cli-test-sandbox');
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 120,
          uiState: { isTrustedFolder: false, sessionStats: mockSessionStats },
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toContain('untrusted');
      expect(lastFrame()).not.toMatch(/test-sandbox/s);
      vi.unstubAllEnvs();
      unmount();
    });
  });

  describe('footer configuration filtering (golden snapshots)', () => {
    beforeEach(() => {
      vi.stubEnv('SANDBOX', '');
      vi.stubEnv('SEATBELT_PROFILE', '');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('renders complete footer with all sections visible (baseline)', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 120,
          uiState: { sessionStats: mockSessionStats },
          settings: createMockSettings({
            ui: {
              footer: {
                hideContextPercentage: false,
              },
            },
          }),
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot('complete-footer-wide');
      unmount();
    });

    it('renders footer with all optional sections hidden (minimal footer)', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 120,
          uiState: { sessionStats: mockSessionStats },
          settings: createMockSettings({
            ui: {
              footer: {
                hideCWD: true,
                hideSandboxStatus: true,
                hideModelInfo: true,
              },
            },
          }),
        },
      );
      await waitUntilReady();
      expect(lastFrame({ allowEmpty: true })).toMatchSnapshot('footer-minimal');
      unmount();
    });

    it('renders footer with only model info hidden (partial filtering)', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 120,
          uiState: { sessionStats: mockSessionStats },
          settings: createMockSettings({
            ui: {
              footer: {
                hideCWD: false,
                hideSandboxStatus: false,
                hideModelInfo: true,
              },
            },
          }),
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot('footer-no-model');
      unmount();
    });

    it('renders footer with CWD and model info hidden to test alignment (only sandbox visible)', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 120,
          uiState: { sessionStats: mockSessionStats },
          settings: createMockSettings({
            ui: {
              footer: {
                hideCWD: true,
                hideSandboxStatus: false,
                hideModelInfo: true,
              },
            },
          }),
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot('footer-only-sandbox');
      unmount();
    });

    it('hides the context percentage when hideContextPercentage is true', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 120,
          uiState: { sessionStats: mockSessionStats },
          settings: createMockSettings({
            ui: {
              footer: {
                hideContextPercentage: true,
              },
            },
          }),
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toContain(defaultProps.model);
      expect(lastFrame()).not.toMatch(/\d+% context left/);
      unmount();
    });
    it('shows the context percentage when hideContextPercentage is false', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 120,
          uiState: { sessionStats: mockSessionStats },
          settings: createMockSettings({
            ui: {
              footer: {
                hideContextPercentage: false,
              },
            },
          }),
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toContain(defaultProps.model);
      expect(lastFrame()).toMatch(/\d+% context left/);
      unmount();
    });
    it('renders complete footer in narrow terminal (baseline narrow)', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 79,
          uiState: { sessionStats: mockSessionStats },
          settings: createMockSettings({
            ui: {
              footer: {
                hideContextPercentage: false,
              },
            },
          }),
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toMatchSnapshot('complete-footer-narrow');
      unmount();
    });
  });
});

describe('fallback mode display', () => {
  it('should display Flash model when in fallback mode, not the configured Pro model', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Footer />,
      {
        width: 120,
        uiState: {
          sessionStats: mockSessionStats,
          currentModel: 'gemini-2.5-flash', // Fallback active, showing Flash
        },
      },
    );
    await waitUntilReady();

    // Footer should show the effective model (Flash), not the config model (Pro)
    expect(lastFrame()).toContain('gemini-2.5-flash');
    expect(lastFrame()).not.toContain('gemini-2.5-pro');
    unmount();
  });

  it('should display Pro model when NOT in fallback mode', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Footer />,
      {
        width: 120,
        uiState: {
          sessionStats: mockSessionStats,
          currentModel: 'gemini-2.5-pro', // Normal mode, showing Pro
        },
      },
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('gemini-2.5-pro');
    unmount();
  });
});
