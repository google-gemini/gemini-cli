/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  renderWithProviders,
  createMockSettings,
} from '../../test-utils/render.js';
import { Footer } from './Footer.js';
import { tildeifyPath } from '@google/gemini-cli-core';

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

const sessionStats = {
  sessionStats: { lastPromptTokenCount: 0, lastResponseTokenCount: 0 },
};

describe('<Footer />', () => {
  it('renders the component', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: { branchName: defaultProps.branchName, ...sessionStats },
    });
    expect(lastFrame()).toBeDefined();
  });

  describe('path display', () => {
    it('should display a shortened path on a narrow terminal', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 79,
        uiState: { ...sessionStats },
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
        uiState: { ...sessionStats },
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
      uiState: { branchName: defaultProps.branchName, ...sessionStats },
    });
    expect(lastFrame()).toContain(`(${defaultProps.branchName}*)`);
  });

  it('does not display the branch name when not provided', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: { branchName: undefined, ...sessionStats },
    });
    expect(lastFrame()).not.toContain(`(${defaultProps.branchName}*)`);
  });

  it('displays the model name and context percentage', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 120,
      uiState: { ...sessionStats },
    });
    expect(lastFrame()).toContain(defaultProps.model);
    expect(lastFrame()).toMatch(/\(\d+% context left\)/);
  });

  it('displays the model name and abbreviated context percentage', () => {
    const { lastFrame } = renderWithProviders(<Footer />, {
      width: 99,
      uiState: { ...sessionStats },
    });
    expect(lastFrame()).toContain(defaultProps.model);
    expect(lastFrame()).toMatch(/\(\d+%\)/);
  });

  describe('sandbox and trust info', () => {
    it('should display untrusted when isTrustedFolder is false', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { isTrustedFolder: false, ...sessionStats },
      });
      expect(lastFrame()).toContain('untrusted');
    });

    it('should display custom sandbox info when SANDBOX env is set', () => {
      vi.stubEnv('SANDBOX', 'gemini-cli-test-sandbox');
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { isTrustedFolder: undefined, ...sessionStats },
      });
      expect(lastFrame()).toContain('test');
      vi.unstubAllEnvs();
    });

    it('should display macOS Seatbelt info when SANDBOX is sandbox-exec', () => {
      vi.stubEnv('SANDBOX', 'sandbox-exec');
      vi.stubEnv('SEATBELT_PROFILE', 'test-profile');
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { isTrustedFolder: true, ...sessionStats },
      });
      expect(lastFrame()).toMatch(/macOS Seatbelt.*\(test-profile\)/s);
      vi.unstubAllEnvs();
    });

    it('should display "no sandbox" when SANDBOX is not set and folder is trusted', () => {
      // Clear any SANDBOX env var that might be set.
      vi.stubEnv('SANDBOX', '');
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { isTrustedFolder: true, ...sessionStats },
      });
      expect(lastFrame()).toContain('no sandbox');
      vi.unstubAllEnvs();
    });

    it('should prioritize untrusted message over sandbox info', () => {
      vi.stubEnv('SANDBOX', 'gemini-cli-test-sandbox');
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { isTrustedFolder: false, ...sessionStats },
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
        uiState: { ...sessionStats },
      });
      expect(lastFrame()).toMatchSnapshot('complete-footer-wide');
    });

    it('renders footer with all optional sections hidden (minimal footer)', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 120,
        uiState: { ...sessionStats },
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
        uiState: { ...sessionStats },
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
        uiState: { ...sessionStats },
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

    it('renders complete footer in narrow terminal (baseline narrow)', () => {
      const { lastFrame } = renderWithProviders(<Footer />, {
        width: 79,
        uiState: { ...sessionStats },
      });
      expect(lastFrame()).toMatchSnapshot('complete-footer-narrow');
    });
  });
});
