/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  renderWithProviders,
  createMockSettings,
} from '../../test-utils/render.js';
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
  it('renders the component', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        branchName: defaultProps.branchName,
        sessionStats: mockSessionStats,
      },
    });
    expect(lastFrame()).toBeDefined();
  });

  describe('path display', () => {
    it('should display a shortened path on a narrow terminal', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 79,
        uiState: { sessionStats: mockSessionStats },
      });
      const tildePath = tildeifyPath(defaultProps.targetDir);
      const pathLength = Math.max(20, Math.floor(79 * 0.25));
      const expectedPath =
        '...' + tildePath.slice(tildePath.length - pathLength + 3);
      expect(lastFrame()).toContain(expectedPath);
    });

    it('should use wide layout at 80 columns', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 80,
        uiState: { sessionStats: mockSessionStats },
      });
      const tildePath = tildeifyPath(defaultProps.targetDir);
      const expectedPath =
        '...' + tildePath.slice(tildePath.length - 80 * 0.25 + 3);
      expect(lastFrame()).toContain(expectedPath);
    });
  });

  it('displays the branch name when provided', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        branchName: defaultProps.branchName,
        sessionStats: mockSessionStats,
      },
    });
    expect(lastFrame()).toContain(`(${defaultProps.branchName}*)`);
  });

  it('does not display the branch name when not provided', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: { branchName: undefined, sessionStats: mockSessionStats },
    });
    expect(lastFrame()).not.toContain(`(${defaultProps.branchName}*)`);
  });

  it('displays the model name and context percentage', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: { sessionStats: mockSessionStats },
      settings: createMockSettings({
        ui: {
          footer: {
            hideContextPercentage: false,
          },
        },
      }),
    });
    expect(lastFrame()).toContain(defaultProps.model);
    expect(lastFrame()).toMatch(/\(\d+% context left\)/);
  });

  it('displays the model name and abbreviated context percentage', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 99,
      uiState: { sessionStats: mockSessionStats },
      settings: createMockSettings({
        ui: {
          footer: {
            hideContextPercentage: false,
          },
        },
      }),
    });
    expect(lastFrame()).toContain(defaultProps.model);
    expect(lastFrame()).toMatch(/\(\d+%\)/);
  });

  describe('sandbox and trust info', () => {
    it('should display untrusted when isTrustedFolder is false', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { isTrustedFolder: false, sessionStats: mockSessionStats },
      });
      expect(lastFrame()).toContain('untrusted');
    });

    it('should display custom sandbox info when SANDBOX env is set', () => {
      vi.stubEnv('SANDBOX', 'gemini-cli-test-sandbox');
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { isTrustedFolder: undefined, sessionStats: mockSessionStats },
      });
      expect(lastFrame()).toContain('test');
      vi.unstubAllEnvs();
    });

    it('should display macOS Seatbelt info when SANDBOX is sandbox-exec', () => {
      vi.stubEnv('SANDBOX', 'sandbox-exec');
      vi.stubEnv('SEATBELT_PROFILE', 'test-profile');
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { isTrustedFolder: true, sessionStats: mockSessionStats },
      });
      expect(lastFrame()).toMatch(/macOS Seatbelt.*\(test-profile\)/s);
      vi.unstubAllEnvs();
    });

    it('should display "no sandbox" when SANDBOX is not set and folder is trusted', () => {
      // Clear any SANDBOX env var that might be set.
      vi.stubEnv('SANDBOX', '');
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { isTrustedFolder: true, sessionStats: mockSessionStats },
      });
      expect(lastFrame()).toContain('no sandbox');
      vi.unstubAllEnvs();
    });

    it('should prioritize untrusted message over sandbox info', () => {
      vi.stubEnv('SANDBOX', 'gemini-cli-test-sandbox');
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { isTrustedFolder: false, sessionStats: mockSessionStats },
      });
      expect(lastFrame()).toContain('untrusted');
      expect(lastFrame()).not.toMatch(/test-sandbox/s);
      vi.unstubAllEnvs();
    });
  });

  describe('footer configuration filtering (golden snapshots)', () => {
    it('renders complete footer with all sections visible (baseline)', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { sessionStats: mockSessionStats },
        settings: createMockSettings({
          ui: {
            footer: {
              hideContextPercentage: false,
            },
          },
        }),
      });
      expect(lastFrame()).toMatchSnapshot('complete-footer-wide');
    });

    it('renders footer with all optional sections hidden (minimal footer)', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
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
      });
      expect(lastFrame()).toMatchSnapshot('footer-minimal');
    });

    it('renders footer with only model info hidden (partial filtering)', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
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
      });
      expect(lastFrame()).toMatchSnapshot('footer-no-model');
    });

    it('renders footer with CWD and model info hidden to test alignment (only sandbox visible)', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
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
      });
      expect(lastFrame()).toMatchSnapshot('footer-only-sandbox');
    });

    it('hides the context percentage when hideContextPercentage is true', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { sessionStats: mockSessionStats },
        settings: createMockSettings({
          ui: {
            footer: {
              hideContextPercentage: true,
            },
          },
        }),
      });
      expect(lastFrame()).toContain(defaultProps.model);
      expect(lastFrame()).not.toMatch(/\(\d+% context left\)/);
    });

    it('shows the context percentage when hideContextPercentage is false', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { sessionStats: mockSessionStats },
        settings: createMockSettings({
          ui: {
            footer: {
              hideContextPercentage: false,
            },
          },
        }),
      });
      expect(lastFrame()).toContain(defaultProps.model);
      expect(lastFrame()).toMatch(/\(\d+% context left\)/);
    });

    it('renders complete footer in narrow terminal (baseline narrow)', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 79,
        uiState: { sessionStats: mockSessionStats },
        settings: createMockSettings({
          ui: {
            footer: {
              hideContextPercentage: false,
            },
          },
        }),
      });
      expect(lastFrame()).toMatchSnapshot('complete-footer-narrow');
    });
  });
});

describe('fallback mode display', () => {
  it('should display Flash model when in fallback mode, not the configured Pro model', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        sessionStats: mockSessionStats,
        currentModel: 'gemini-2.5-flash', // Fallback active, showing Flash
      },
    });

    // Footer should show the effective model (Flash), not the config model (Pro)
    expect(lastFrame()).toContain('gemini-2.5-flash');
    expect(lastFrame()).not.toContain('gemini-2.5-pro');
  });

  it('should display Pro model when NOT in fallback mode', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        sessionStats: mockSessionStats,
        currentModel: 'gemini-2.5-pro', // Normal mode, showing Pro
      },
    });

    expect(lastFrame()).toContain('gemini-2.5-pro');
  });
});
