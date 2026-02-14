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
import type { UIState } from '../contexts/UIStateContext.js';

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
    expect(lastFrame()).toMatch(/\d+% context left/);
  });

  it('displays the usage indicator when usage is low', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
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
    });
    expect(lastFrame()).toContain('15%');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('hides the usage indicator when usage is not near limit', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
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
    });
    expect(lastFrame()).not.toContain('Usage remaining');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('displays "Limit reached" message when remaining is 0', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
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
    });
    expect(lastFrame()).toContain('Limit reached');
    expect(lastFrame()).toMatchSnapshot();
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
    expect(lastFrame()).toMatch(/\d+%/);
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
    beforeEach(() => {
      vi.stubEnv('SANDBOX', '');
      vi.stubEnv('SEATBELT_PROFILE', '');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

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
      expect(lastFrame()).not.toMatch(/\d+% context left/);
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
      expect(lastFrame()).toMatch(/\d+% context left/);
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

describe('Footer Token Formatting', () => {
  const setup = (totalTokens: number) => {
    const settings = createMockSettings();
    settings.merged.ui.footer.items = ['token-count'];

    const uiState: Partial<UIState> = {
      sessionStats: {
        sessionStartTime: new Date(),
        promptCount: 0,
        lastPromptTokenCount: 0,
        sessionId: 'test-session',
        metrics: {
          models: {
            'gemini-pro': {
              api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
              tokens: {
                total: totalTokens,
                input: totalTokens / 2,
                candidates: totalTokens / 2,
                prompt: totalTokens / 2,
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
              [ToolCallDecision.ACCEPT]: 0,
              [ToolCallDecision.REJECT]: 0,
              [ToolCallDecision.MODIFY]: 0,
              [ToolCallDecision.AUTO_ACCEPT]: 0,
            },
            byName: {},
          },
          files: { totalLinesAdded: 0, totalLinesRemoved: 0 },
        },
      },
    };

    return renderWithProviders(<Footer />, {
      settings,
      uiState,
    });
  };

  it('formats thousands with k', () => {
    const { lastFrame } = setup(12400);
    expect(lastFrame()).toContain('12.4k tokens');
  });

  it('formats millions with m', () => {
    const { lastFrame } = setup(1500000);
    expect(lastFrame()).toContain('1.5m tokens');
  });

  it('formats billions with b', () => {
    const { lastFrame } = setup(2700000000);
    expect(lastFrame()).toContain('2.7b tokens');
  });

  it('formats small numbers without suffix', () => {
    const { lastFrame } = setup(850);
    expect(lastFrame()).toContain('850 tokens');
  });
});

describe('Footer Custom Items', () => {
  const customMockSessionStats: SessionStatsState = {
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

  it('renders items in the specified order', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        currentModel: 'gemini-pro',
        sessionStats: customMockSessionStats,
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
    expect(output).toContain('150 tokens');

    // Check order
    const idIdx = output!.indexOf('test-ses');
    const codeIdx = output!.indexOf('+12 -4');
    const tokenIdx = output!.indexOf('150 tokens');

    expect(idIdx).toBeLessThan(codeIdx);
    expect(codeIdx).toBeLessThan(tokenIdx);
  });

  it('renders all items with dividers', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        currentModel: 'gemini-pro',
        sessionStats: customMockSessionStats,
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
      uiState: { sessionStats: customMockSessionStats },
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
        sessionStats: customMockSessionStats,
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
