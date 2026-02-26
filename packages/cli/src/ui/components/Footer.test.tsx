/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { Footer } from './Footer.js';
import { createMockSettings } from '../../test-utils/settings.js';
import path from 'node:path';

// Normalize paths to POSIX slashes for stable cross-platform snapshots.
// We replace the Windows drive letter with spaces to preserve the rendered string length.
const normalizeFrame = (frame: string | undefined) => {
  if (!frame) return frame;
  return frame.replace(/\\/g, '/').replace(/[A-Za-z]:\//g, '  /');
};

const mockSessionStats = {
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
        roles: {},
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
      const output = lastFrame();
      expect(output).toBeDefined();
      // Should contain some part of the path, likely shortened
      expect(output).toContain(
        path.join('directories', 'to', 'make', 'it', 'long'),
      );
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
      const output = lastFrame();
      expect(output).toBeDefined();
      expect(output).toContain(
        path.join('directories', 'to', 'make', 'it', 'long'),
      );
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
    expect(lastFrame()).toContain(defaultProps.branchName);
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
    expect(lastFrame()).not.toContain('Branch');
    unmount();
  });

  it('displays the model name and context percentage', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Footer />,
      {
        width: 120,
        uiState: {
          currentModel: defaultProps.model,
          sessionStats: {
            ...mockSessionStats,
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
      },
    );
    await waitUntilReady();
    expect(lastFrame()).toContain(defaultProps.model);
    expect(lastFrame()).toMatch(/\d+% left/);
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
    expect(normalizeFrame(lastFrame())).toMatchSnapshot();
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
    expect(normalizeFrame(lastFrame())).toMatchSnapshot();
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
    expect(lastFrame()?.toLowerCase()).toContain('limit reached');
    expect(normalizeFrame(lastFrame())).toMatchSnapshot();
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
      expect(normalizeFrame(lastFrame())).toMatchSnapshot(
        'complete-footer-wide',
      );
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
      expect(normalizeFrame(lastFrame({ allowEmpty: true }))).toMatchSnapshot(
        'footer-minimal',
      );
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
      expect(normalizeFrame(lastFrame())).toMatchSnapshot('footer-no-model');
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
      expect(normalizeFrame(lastFrame())).toMatchSnapshot(
        'footer-only-sandbox',
      );
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
      expect(lastFrame()).not.toMatch(/\d+% left/);
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
      expect(lastFrame()).toMatch(/\d+% left/);
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
      expect(normalizeFrame(lastFrame())).toMatchSnapshot(
        'complete-footer-narrow',
      );
      unmount();
    });
  });

  describe('Footer Token Formatting', () => {
    const renderWithTokens = async (tokens: number) => {
      const result = renderWithProviders(<Footer />, {
        width: 120,
        uiState: {
          sessionStats: {
            ...mockSessionStats,
            metrics: {
              ...mockSessionStats.metrics,
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
                  roles: {},
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
      await result.waitUntilReady();
      return result;
    };

    it('formats thousands with k', async () => {
      const { lastFrame, unmount } = await renderWithTokens(1500);
      expect(lastFrame()).toContain('1.5k tokens');
      unmount();
    });

    it('formats millions with m', async () => {
      const { lastFrame, unmount } = await renderWithTokens(1500000);
      expect(lastFrame()).toContain('1.5m tokens');
      unmount();
    });

    it('formats billions with b', async () => {
      const { lastFrame, unmount } = await renderWithTokens(1500000000);
      expect(lastFrame()).toContain('1.5b tokens');
      unmount();
    });

    it('formats small numbers without suffix', async () => {
      const { lastFrame, unmount } = await renderWithTokens(500);
      expect(lastFrame()).toContain('500 tokens');
      unmount();
    });
  });

  describe('Footer Custom Items', () => {
    it('renders items in the specified order', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 120,
          uiState: {
            currentModel: 'gemini-pro',
            sessionStats: mockSessionStats,
          },
          settings: createMockSettings({
            ui: {
              footer: {
                items: ['model-name', 'cwd'],
              },
            },
          }),
        },
      );
      await waitUntilReady();

      const output = lastFrame();
      const modelIdx = output.indexOf('/model');
      const cwdIdx = output.indexOf('Path');
      expect(modelIdx).toBeLessThan(cwdIdx);
      unmount();
    });

    it('renders multiple items with proper alignment', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 120,
          uiState: {
            sessionStats: mockSessionStats,
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
        },
      );
      await waitUntilReady();

      const output = lastFrame();
      expect(output).toBeDefined();
      // Headers should be present
      expect(output).toContain('Path');
      expect(output).toContain('Branch');
      expect(output).toContain('/docs');
      expect(output).toContain('/model');
      // Data should be present
      expect(output).toContain('main');
      expect(output).toContain('gemini-pro');
      unmount();
    });

    it('handles empty items array', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
          width: 120,
          uiState: { sessionStats: mockSessionStats },
          settings: createMockSettings({
            ui: {
              footer: {
                items: [],
              },
            },
          }),
        },
      );
      await waitUntilReady();

      const output = lastFrame({ allowEmpty: true });
      expect(output).toBeDefined();
      expect(output.trim()).toBe('');
      unmount();
    });

    it('does not render items that are conditionally hidden', async () => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <Footer />,
        {
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
        },
      );
      await waitUntilReady();

      const output = lastFrame();
      expect(output).toBeDefined();
      expect(output).not.toContain('Branch');
      expect(output).toContain('Path');
      expect(output).toContain('/model');
      unmount();
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
});
