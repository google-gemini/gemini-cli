/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { Footer } from './Footer.js';
import { createMockSettings } from '../../test-utils/settings.js';

const customMockSessionStats = {
  sessionId: 'test-session-id',
  sessionStartTime: new Date(),
  promptCount: 0,
  lastPromptTokenCount: 150000,
  metrics: {
    files: {
      totalLinesAdded: 12,
      totalLinesRemoved: 4,
    },
    tools: {
      count: 0,
      totalCalls: 0,
      totalSuccess: 0,
      totalFail: 0,
      totalDurationMs: 0,
      totalDecisions: {
        accept: 0,
        reject: 0,
        modify: 0,
        auto_accept: 0,
      },
      byName: {},
      latency: { avg: 0, max: 0, min: 0 },
    },
    models: {
      'gemini-pro': {
        api: {
          totalRequests: 0,
          totalErrors: 0,
          totalLatencyMs: 0,
        },
        tokens: {
          input: 0,
          prompt: 0,
          candidates: 0,
          total: 1500,
          cached: 0,
          thoughts: 0,
          tool: 0,
        },
      },
    },
  },
};

const defaultProps = {
  model: 'gemini-pro',
  targetDir: '/long/path/to/some/deeply/nested/directories/to/make/it/long',
  debugMode: false,
  branchName: 'main',
  errorCount: 0,
};

describe('<Footer />', () => {
  it('renders the component', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: { sessionStats: customMockSessionStats },
    });
    expect(lastFrame()).toBeDefined();
  });

  describe('path display', () => {
    it('should display a shortened path on a narrow terminal', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 40,
        uiState: {
          sessionStats: customMockSessionStats,
        },
      });
      const output = lastFrame();
      expect(output).toBeDefined();
      expect(output!.length).toBeLessThanOrEqual(120); // 40 width * 3? it depends.
    });

    it('should use wide layout at 80 columns', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 80,
        uiState: {
          sessionStats: customMockSessionStats,
        },
      });
      const output = lastFrame();
      expect(output).toBeDefined();
    });
  });

  it('displays the branch name when provided', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        branchName: defaultProps.branchName,
        sessionStats: customMockSessionStats,
      },
    });
    expect(lastFrame()).toContain(defaultProps.branchName);
  });

  it('does not display the branch name when not provided', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: { branchName: undefined, sessionStats: customMockSessionStats },
    });
    expect(lastFrame()).not.toContain('(');
  });

  it('displays the model name and context percentage', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        currentModel: 'gemini-pro',
        sessionStats: {
          ...customMockSessionStats,
          lastPromptTokenCount: 1000,
        },
      },
      settings: createMockSettings({
        ui: {
          footer: {
            hideContextPercentage: false,
          },
        },
      }),
    });
    expect(lastFrame()).toContain('gemini-pro');
  });

  it('displays the usage indicator when usage is low', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        quota: {
          stats: { remaining: 15, limit: 100 },
          userTier: 'free',
          proQuotaRequest: null,
          validationRequest: null,
        },
        sessionStats: customMockSessionStats,
      },
    });
    expect(lastFrame()).toContain('15%');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('hides the usage indicator when usage is not near limit', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        quota: {
          stats: { remaining: 85, limit: 100 },
          userTier: 'free',
          proQuotaRequest: null,
          validationRequest: null,
        },
        sessionStats: customMockSessionStats,
      },
    });
    expect(lastFrame()).not.toContain('Usage remaining');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('displays "Limit reached" message when remaining is 0', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: {
        quota: {
          stats: { remaining: 0, limit: 100 },
          userTier: 'free',
          proQuotaRequest: null,
          validationRequest: null,
        },
        sessionStats: customMockSessionStats,
      },
    });
    expect(lastFrame()?.toLowerCase()).toContain('limit reached');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('displays the model name and abbreviated context percentage', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 80,
      uiState: {
        currentModel: 'gemini-pro',
        sessionStats: {
          ...customMockSessionStats,
          lastPromptTokenCount: 500,
        },
      },
      settings: createMockSettings({
        ui: {
          footer: {
            hideContextPercentage: false,
          },
        },
      }),
    });
    expect(lastFrame()).toContain('gemini-pro');
  });

  describe('sandbox and trust info', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should display untrusted when isTrustedFolder is false', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: {
          isTrustedFolder: false,
          sessionStats: customMockSessionStats,
        },
      });
      expect(lastFrame()).toContain('untrusted');
    });

    it('should display custom sandbox info when SANDBOX env is set', () => {
      vi.stubEnv('SANDBOX', 'gemini-test-sandbox');
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: {
          isTrustedFolder: true,
          sessionStats: customMockSessionStats,
        },
      });
      expect(lastFrame()).toContain('test-sandbox');
    });

    it('should display macOS Seatbelt info when SANDBOX is sandbox-exec', () => {
      vi.stubEnv('SANDBOX', 'sandbox-exec');
      vi.stubEnv('SEATBELT_PROFILE', 'test-profile');
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: {
          isTrustedFolder: true,
          sessionStats: customMockSessionStats,
        },
      });
      expect(lastFrame()).toContain('macOS Seatbelt');
      expect(lastFrame()).toContain('test-profile');
    });

    it('should display "no sandbox" when SANDBOX is not set and folder is trusted', () => {
      vi.stubEnv('SANDBOX', '');
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: {
          isTrustedFolder: true,
          sessionStats: customMockSessionStats,
        },
      });
      expect(lastFrame()).toContain('no sandbox');
    });

    it('should prioritize untrusted message over sandbox info', () => {
      vi.stubEnv('SANDBOX', 'gemini-test-sandbox');
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: {
          isTrustedFolder: false,
          sessionStats: customMockSessionStats,
        },
      });
      expect(lastFrame()).toContain('untrusted');
      expect(lastFrame()).not.toContain('test-sandbox');
    });
  });

  describe('footer configuration filtering (golden snapshots)', () => {
    it('renders complete footer with all sections visible (baseline)', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: {
          currentModel: 'gemini-pro',
          sessionStats: {
            ...customMockSessionStats,
            lastPromptTokenCount: 0,
          },
        },
        settings: createMockSettings({
          ui: {
            footer: {
              items: [
                'cwd',
                'sandbox-status',
                'model-name',
                'context-remaining',
              ],
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
        uiState: { sessionStats: customMockSessionStats },
        settings: createMockSettings({
          ui: {
            footer: {
              items: [],
            },
          },
        }),
      });
      expect(lastFrame()).toMatchSnapshot('footer-minimal');
    });

    it('renders footer with only model info hidden (partial filtering)', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: {
          sessionStats: customMockSessionStats,
        },
        settings: createMockSettings({
          ui: {
            footer: {
              items: ['cwd', 'sandbox-status'],
            },
          },
        }),
      });
      expect(lastFrame()).toMatchSnapshot('footer-no-model');
    });

    it('renders footer with CWD and model info hidden to test alignment (only sandbox visible)', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { sessionStats: customMockSessionStats },
        settings: createMockSettings({
          ui: {
            footer: {
              items: ['sandbox-status'],
            },
          },
        }),
      });
      expect(lastFrame()).toMatchSnapshot('footer-only-sandbox');
    });

    it('hides the context percentage when hideContextPercentage is true', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: {
          currentModel: 'gemini-pro',
          sessionStats: {
            ...customMockSessionStats,
            lastPromptTokenCount: 1000,
          },
        },
        settings: createMockSettings({
          ui: {
            footer: {
              items: ['model-name', 'context-remaining'],
              hideContextPercentage: true,
            },
          },
        }),
      });
      expect(lastFrame()).not.toContain('left');
    });

    it('shows the context percentage when hideContextPercentage is false', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: {
          currentModel: 'gemini-pro',
          sessionStats: {
            ...customMockSessionStats,
            lastPromptTokenCount: 1000,
          },
        },
        settings: createMockSettings({
          ui: {
            footer: {
              items: ['model-name', 'context-remaining'],
              hideContextPercentage: false,
            },
          },
        }),
      });
      expect(lastFrame()).toContain('left');
    });

    it('renders complete footer in narrow terminal (baseline narrow)', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 80,
        uiState: {
          currentModel: 'gemini-pro',
          sessionStats: {
            ...customMockSessionStats,
            lastPromptTokenCount: 0,
          },
        },
        settings: createMockSettings({
          ui: {
            footer: {
              items: [
                'cwd',
                'sandbox-status',
                'model-name',
                'context-remaining',
              ],
              hideContextPercentage: false,
            },
          },
        }),
      });
      expect(lastFrame()).toMatchSnapshot('complete-footer-narrow');
    });
  });

  describe('fallback mode display', () => {
    it('should display Flash model when in fallback mode, not the configured Pro model', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: {
          currentModel: 'gemini-1.5-flash',
          sessionStats: customMockSessionStats,
        },
      });
      expect(lastFrame()).toContain('gemini-1.5-flash');
    });

    it('should display Pro model when NOT in fallback mode', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: {
          currentModel: 'gemini-pro',
          sessionStats: customMockSessionStats,
        },
      });
      expect(lastFrame()).toContain('gemini-pro');
    });
  });

  describe('Footer Token Formatting', () => {
    const renderWithTokens = (tokens: number) =>
      renderWithProviders(<Footer />, {
        width: 120,
        uiState: {
          sessionStats: {
            ...customMockSessionStats,
            metrics: {
              ...customMockSessionStats.metrics,
              models: {
                'gemini-pro': {
                  api: {
                    totalRequests: 0,
                    totalErrors: 0,
                    totalLatencyMs: 0,
                  },
                  tokens: {
                    input: 0,
                    prompt: 0,
                    candidates: 0,
                    total: tokens,
                    cached: 0,
                    thoughts: 0,
                    tool: 0,
                  },
                },
              },
            },
          },
        },
        settings: createMockSettings({
          ui: {
            footer: {
              items: ['token-count'],
            },
          },
        }),
      });

    it('formats thousands with k', () => {
      const { lastFrame } = renderWithTokens(1500);
      expect(lastFrame()).toContain('1.5k tokens');
    });

    it('formats millions with m', () => {
      const { lastFrame } = renderWithTokens(1500000);
      expect(lastFrame()).toContain('1.5m tokens');
    });

    it('formats billions with b', () => {
      const { lastFrame } = renderWithTokens(1500000000);
      expect(lastFrame()).toContain('1.5b tokens');
    });

    it('formats small numbers without suffix', () => {
      const { lastFrame } = renderWithTokens(500);
      expect(lastFrame()).toContain('500 tokens');
    });
  });

  describe('Footer Custom Items', () => {
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
              items: ['model-name', 'cwd'],
            },
          },
        }),
      });

      const output = lastFrame();
      const modelIdx = output!.indexOf('/model');
      const cwdIdx = output!.indexOf('Path');
      expect(modelIdx).toBeLessThan(cwdIdx);
    });

    it('renders multiple items with proper alignment', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: {
          sessionStats: customMockSessionStats,
          branchName: 'main',
        },
        settings: createMockSettings({
          vimMode: {
            vimMode: true,
          },
          ui: {
            footer: {
              items: ['cwd', 'git-branch', 'sandbox-status', 'model-name'],
            },
          },
        }),
      });

      const output = lastFrame();
      expect(output).toBeDefined();
      // Headers should be present
      expect(output).toContain('Path');
      expect(output).toContain('Branch');
      expect(output).toContain('/docs');
      expect(output).toContain('/model');
      // Data should be present
      expect(output).toContain('main*');
      expect(output).toContain('gemini-pro');
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
      expect(output).not.toContain('Branch');
      expect(output).toContain('Path');
      expect(output).toContain('/model');
    });
  });
});
