/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { Footer } from './Footer.js';
import { createMockSettings } from '../../test-utils/settings.js';
import {
  type Config,
  UserAccountManager,
  AuthType,
} from '@google/gemini-cli-core';
import path from 'node:path';

// Normalize paths to POSIX slashes for stable cross-platform snapshots.
const normalizeFrame = (frame: string | undefined) => {
  if (!frame) return frame;
  return frame.replace(/\\/g, '/');
};

const { mocks } = vi.hoisted(() => ({
  mocks: {
    isDevelopment: false,
  },
}));

vi.mock('../../utils/installationInfo.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../utils/installationInfo.js')>();
  return {
    ...original,
    get isDevelopment() {
      return mocks.isDevelopment;
    },
  };
});

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
  targetDir: path.join(
    path.parse(process.cwd()).root,
    'Users',
    'test',
    'project',
    'foo',
    'bar',
    'and',
    'some',
    'more',
    'directories',
    'to',
    'make',
    'it',
    'long',
  ),
  branchName: 'main',
};

const mockConfigPlain = {
  getTargetDir: () => defaultProps.targetDir,
  getDebugMode: () => false,
  getModel: () => defaultProps.model,
  getIdeMode: () => false,
  isTrustedFolder: () => true,
  getExtensionRegistryURI: () => undefined,
  getContentGeneratorConfig: () => ({ authType: undefined }),
  getSandboxEnabled: () => false,
  getSessionId: () => 'test-session-id',
};

const mockConfig = mockConfigPlain as unknown as Config;

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

describe('<Footer />', () => {
  beforeEach(() => {
    const root = path.parse(process.cwd()).root;
    vi.stubEnv('GEMINI_CLI_HOME', path.join(root, 'Users', 'test'));
    vi.stubEnv('SANDBOX', '');
    vi.stubEnv('SEATBELT_PROFILE', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the component', async () => {
    const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
      config: mockConfig,
      width: 120,
      uiState: {
        branchName: defaultProps.branchName,
        sessionStats: mockSessionStats,
      },
    });
    expect(lastFrame()).toBeDefined();
    unmount();
  });

  describe('path display', () => {
    it('should display a shortened path on a narrow terminal', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 79,
        uiState: { sessionStats: mockSessionStats },
      });
      const output = lastFrame();
      expect(output).toBeDefined();
      // Should contain some part of the path, likely shortened
      expect(output).toContain(path.join('make', 'it'));
      unmount();
    });

    it('should use wide layout at 80 columns', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 80,
        uiState: { sessionStats: mockSessionStats },
      });
      const output = lastFrame();
      expect(output).toBeDefined();
      expect(output).toContain(path.join('make', 'it'));
      unmount();
    });

    it('should not truncate high-priority items on narrow terminals (regression)', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 60,
        uiState: {
          sessionStats: mockSessionStats,
        },
        settings: createMockSettings({
          general: {
            vimMode: true,
          },
          ui: {
            footer: {
              showLabels: true,
              items: ['workspace', 'model-name'],
            },
          },
        }),
      });
      const output = lastFrame();
      // [INSERT] is high priority and should be fully visible
      // (Note: VimModeProvider defaults to 'INSERT' mode when enabled)
      expect(output).toContain('[INSERT]');
      // Other items should be present but might be shortened
      expect(output).toContain('gemini-pro');
      unmount();
    });
  });

  it('displays the branch name when provided', async () => {
    const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
      config: mockConfig,
      width: 120,
      uiState: {
        branchName: defaultProps.branchName,
        sessionStats: mockSessionStats,
      },
    });
    expect(lastFrame()).toContain(defaultProps.branchName);
    unmount();
  });

  it('does not display the branch name when not provided', async () => {
    const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
      config: mockConfig,
      width: 120,
      uiState: { branchName: undefined, sessionStats: mockSessionStats },
    });
    expect(lastFrame()).not.toContain('Branch');
    unmount();
  });

  it('displays the model name and context percentage', async () => {
    const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
      config: mockConfig,
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
    });
    expect(lastFrame()).toContain(defaultProps.model);
    expect(lastFrame()).toMatch(/\d+% used/);
    unmount();
  });

  it('displays the usage indicator when usage is low', async () => {
    const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
      config: mockConfig,
      width: 120,
      uiState: {
        sessionStats: mockSessionStats,
      },
      quotaState: {
        stats: {
          remaining: 15,
          limit: 100,
          resetTime: undefined,
        },
      },
    });
    expect(lastFrame()).toContain('85% used');
    expect(normalizeFrame(lastFrame())).toMatchSnapshot();
    unmount();
  });

  it('hides the usage indicator when usage is not near limit', async () => {
    const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
      config: mockConfig,
      width: 120,
      uiState: {
        sessionStats: mockSessionStats,
      },
      quotaState: {
        stats: {
          remaining: 85,
          limit: 100,
          resetTime: undefined,
        },
      },
    });
    expect(normalizeFrame(lastFrame())).toContain('15% used');
    expect(normalizeFrame(lastFrame())).toMatchSnapshot();
    unmount();
  });

  it('displays "Limit reached" message when remaining is 0', async () => {
    const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
      config: mockConfig,
      width: 120,
      uiState: {
        sessionStats: mockSessionStats,
      },
      quotaState: {
        stats: {
          remaining: 0,
          limit: 100,
          resetTime: undefined,
        },
      },
    });
    expect(lastFrame()?.toLowerCase()).toContain('limit reached');
    expect(normalizeFrame(lastFrame())).toMatchSnapshot();
    unmount();
  });

  it('displays the model name and abbreviated context used label on narrow terminals', async () => {
    const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
      config: mockConfig,
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
    expect(lastFrame()).not.toContain('context used');
    unmount();
  });

  describe('sandbox and trust info', () => {
    it('should display untrusted when isTrustedFolder is false', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 120,
        uiState: { isTrustedFolder: false, sessionStats: mockSessionStats },
      });
      expect(lastFrame()).toContain('untrusted');
      unmount();
    });

    it('should display "current process" for custom sandbox when SANDBOX env is set', async () => {
      vi.stubEnv('SANDBOX', 'gemini-cli-test-sandbox');
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 120,
        uiState: {
          isTrustedFolder: undefined,
          sessionStats: mockSessionStats,
        },
      });
      expect(lastFrame()).toContain('current process');
      vi.unstubAllEnvs();
      unmount();
    });

    it('should display "current process" for macOS Seatbelt when SANDBOX is sandbox-exec', async () => {
      vi.stubEnv('SANDBOX', 'sandbox-exec');
      vi.stubEnv('SEATBELT_PROFILE', 'test-profile');
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 120,
        uiState: { isTrustedFolder: true, sessionStats: mockSessionStats },
      });
      expect(lastFrame()).toContain('current process');
      vi.unstubAllEnvs();
      unmount();
    });

    it('should display "no sandbox" when SANDBOX is not set and folder is trusted', async () => {
      // Clear any SANDBOX env var that might be set.
      vi.stubEnv('SANDBOX', '');
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 120,
        uiState: { isTrustedFolder: true, sessionStats: mockSessionStats },
      });
      expect(lastFrame()).toContain('no sandbox');
      vi.unstubAllEnvs();
      unmount();
    });

    it('should display "all tools" when tool sandboxing is enabled and agent is local', async () => {
      vi.stubEnv('SANDBOX', '');
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: Object.assign(
          Object.create(Object.getPrototypeOf(mockConfig)),
          mockConfig,
          {
            getSandboxEnabled: () => true,
          },
        ),
        width: 120,
        uiState: { isTrustedFolder: true, sessionStats: mockSessionStats },
      });
      expect(lastFrame()).toContain('all tools');
      vi.unstubAllEnvs();
      unmount();
    });

    it('should prioritize untrusted message over sandbox info', async () => {
      vi.stubEnv('SANDBOX', 'gemini-cli-test-sandbox');
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 120,
        uiState: { isTrustedFolder: false, sessionStats: mockSessionStats },
      });
      expect(lastFrame()).toContain('untrusted');
      expect(lastFrame()).not.toMatch(/test-sandbox/s);
      vi.unstubAllEnvs();
      unmount();
    });
  });

  describe('footer configuration filtering (golden snapshots)', () => {
    it('renders complete footer with all sections visible (baseline)', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
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
      expect(normalizeFrame(lastFrame())).toMatchSnapshot(
        'complete-footer-wide',
      );
      unmount();
    });

    it('renders footer with all optional sections hidden (minimal footer)', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
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
      // Wait for Ink to render
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(normalizeFrame(lastFrame({ allowEmpty: true }))).toMatchSnapshot(
        'footer-minimal',
      );
      unmount();
    });

    it('renders footer with only model info hidden (partial filtering)', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
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
      expect(normalizeFrame(lastFrame())).toMatchSnapshot('footer-no-model');
      unmount();
    });

    it('renders footer with CWD and model info hidden to test alignment (only sandbox visible)', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
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
      expect(normalizeFrame(lastFrame())).toMatchSnapshot(
        'footer-only-sandbox',
      );
      unmount();
    });

    it('hides the context percentage when hideContextPercentage is true', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
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
      expect(lastFrame()).not.toMatch(/\d+% used/);
      unmount();
    });
    it('shows the context percentage when hideContextPercentage is false', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
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
      expect(lastFrame()).toMatch(/\d+% used/);
      unmount();
    });
    it('renders complete footer in narrow terminal (baseline narrow)', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
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
      expect(normalizeFrame(lastFrame())).toMatchSnapshot(
        'complete-footer-narrow',
      );
      unmount();
    });
  });

  describe('Footer Token Formatting', () => {
    const renderWithTokens = async (tokens: number) => {
      const result = await renderWithProviders(<Footer />, {
        config: mockConfig,
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

  describe('error summary visibility', () => {
    beforeEach(() => {
      mocks.isDevelopment = false;
    });

    afterEach(() => {
      mocks.isDevelopment = false;
    });

    it('hides error summary in low verbosity mode out of dev mode', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 120,
        uiState: {
          sessionStats: mockSessionStats,
          errorCount: 2,
          showErrorDetails: false,
        },
        settings: createMockSettings({ ui: { errorVerbosity: 'low' } }),
      });
      expect(lastFrame()).not.toContain('F12 for details');
      unmount();
    });

    it('shows error summary in low verbosity mode in dev mode', async () => {
      mocks.isDevelopment = true;
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 120,
        uiState: {
          sessionStats: mockSessionStats,
          errorCount: 2,
          showErrorDetails: false,
        },
        settings: createMockSettings({ ui: { errorVerbosity: 'low' } }),
      });
      expect(lastFrame()).toContain('F12 for details');
      expect(lastFrame()).toContain('2 errors');
      unmount();
    });

    it('shows error summary in full verbosity mode', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 120,
        uiState: {
          sessionStats: mockSessionStats,
          errorCount: 2,
          showErrorDetails: false,
        },
        settings: createMockSettings({ ui: { errorVerbosity: 'full' } }),
      });
      expect(lastFrame()).toContain('F12 for details');
      expect(lastFrame()).toContain('2 errors');
      unmount();
    });
  });

  describe('Footer Custom Items', () => {
    it('renders auth item with email', async () => {
      const authConfig = {
        ...mockConfigPlain,
        getContentGeneratorConfig: () => ({
          authType: AuthType.LOGIN_WITH_GOOGLE,
        }),
      } as unknown as Config;
      const getCachedAccountSpy = vi
        .spyOn(UserAccountManager.prototype, 'getCachedGoogleAccount')
        .mockReturnValue('test@example.com');

      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: authConfig,
        width: 120,
        uiState: {
          currentModel: 'gemini-pro',
          sessionStats: mockSessionStats,
        },
        settings: createMockSettings({
          ui: {
            footer: {
              items: ['auth'],
            },
          },
        }),
      });

      expect(lastFrame()).toContain('auth');
      expect(lastFrame()).toContain('test@example.com');
      unmount();
      getCachedAccountSpy.mockRestore();
    });

    it('does NOT render auth item when showUserIdentity is false', async () => {
      const authConfig = {
        ...mockConfigPlain,
        getContentGeneratorConfig: () => ({
          authType: AuthType.LOGIN_WITH_GOOGLE,
        }),
      } as unknown as Config;
      const getCachedAccountSpy = vi
        .spyOn(UserAccountManager.prototype, 'getCachedGoogleAccount')
        .mockReturnValue('test@example.com');

      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: authConfig,
        width: 120,
        uiState: {
          currentModel: 'gemini-pro',
          sessionStats: mockSessionStats,
        },
        settings: createMockSettings({
          ui: {
            showUserIdentity: false,
            footer: {
              items: ['workspace', 'auth'],
            },
          },
        }),
      });

      const output = lastFrame();
      expect(output).toContain('workspace');
      expect(output).not.toContain('auth');
      expect(output).not.toContain('test@example.com');
      unmount();
      getCachedAccountSpy.mockRestore();
    });

    it('renders items in the specified order', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 120,
        uiState: {
          currentModel: 'gemini-pro',
          sessionStats: mockSessionStats,
        },
        settings: createMockSettings({
          ui: {
            footer: {
              items: ['model-name', 'workspace'],
            },
          },
        }),
      });

      const output = lastFrame();
      const modelIdx = output.indexOf('/model');
      const cwdIdx = output.indexOf('workspace (/directory)');
      expect(modelIdx).toBeLessThan(cwdIdx);
      unmount();
    });

    it('renders multiple items with proper alignment', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
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
              items: ['workspace', 'git-branch', 'sandbox', 'model-name'],
            },
          },
        }),
      });

      const output = lastFrame();
      expect(output).toBeDefined();
      // Headers should be present
      expect(output).toContain('workspace (/directory)');
      expect(output).toContain('branch');
      expect(output).toContain('sandbox');
      expect(output).toContain('/model');
      // Data should be present
      expect(output).toContain('main');
      expect(output).toContain('gemini-pro');
      unmount();
    });

    it('handles empty items array', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
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
      // Wait for Ink to render
      await new Promise((resolve) => setTimeout(resolve, 50));

      const output = lastFrame({ allowEmpty: true });
      expect(output).toBeDefined();
      expect(output.trim()).toBe('');
      unmount();
    });

    it('does not render items that are conditionally hidden', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 120,
        uiState: {
          sessionStats: mockSessionStats,
          branchName: undefined, // No branch
        },
        settings: createMockSettings({
          ui: {
            footer: {
              items: ['workspace', 'git-branch', 'model-name'],
            },
          },
        }),
      });

      const output = lastFrame();
      expect(output).toBeDefined();
      expect(output).not.toContain('branch');
      expect(output).toContain('workspace (/directory)');
      expect(output).toContain('/model');
      unmount();
    });
  });

  describe('fallback mode display', () => {
    it('should display Flash model when in fallback mode, not the configured Pro model', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 120,
        uiState: {
          sessionStats: mockSessionStats,
          currentModel: 'gemini-2.5-flash', // Fallback active, showing Flash
        },
      });

      // Footer should show the effective model (Flash), not the config model (Pro)
      expect(lastFrame()).toContain('gemini-2.5-flash');
      expect(lastFrame()).not.toContain('gemini-2.5-pro');
      unmount();
    });

    it('should display Pro model when NOT in fallback mode', async () => {
      const { lastFrame, unmount } = await renderWithProviders(<Footer />, {
        config: mockConfig,
        width: 120,
        uiState: {
          sessionStats: mockSessionStats,
          currentModel: 'gemini-2.5-pro', // Normal mode, showing Pro
        },
      });

      expect(lastFrame()).toContain('gemini-2.5-pro');
      unmount();
    });
  });
});
