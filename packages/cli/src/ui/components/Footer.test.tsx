/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { Footer } from './Footer.js';
import * as useTerminalSize from '../hooks/useTerminalSize.js';
import { tildeifyPath } from '@google/gemini-cli-core';
import { type UIState, UIStateContext } from '../contexts/UIStateContext.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { SettingsContext } from '../contexts/SettingsContext.js';
import type { LoadedSettings } from '../../config/settings.js';
import { VimModeProvider } from '../contexts/VimModeContext.js';

vi.mock('../hooks/useTerminalSize.js');
const useTerminalSizeMock = vi.mocked(useTerminalSize.useTerminalSize);

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

const createMockConfig = (overrides = {}) => ({
  getModel: vi.fn(() => defaultProps.model),
  getTargetDir: vi.fn(() => defaultProps.targetDir),
  getDebugMode: vi.fn(() => false),
  ...overrides,
});

const createMockUIState = (overrides: Partial<UIState> = {}): UIState =>
  ({
    sessionStats: {
      lastPromptTokenCount: 100,
    },
    branchName: defaultProps.branchName,
    ...overrides,
  }) as UIState;

const createDefaultSettings = (
  options: {
    showMemoryUsage?: boolean;
    hideCWD?: boolean;
    hideSandboxStatus?: boolean;
    hideModelInfo?: boolean;
  } = {},
): LoadedSettings =>
  ({
    merged: {
      ui: {
        showMemoryUsage: options.showMemoryUsage,
        footer: {
          hideCWD: options.hideCWD,
          hideSandboxStatus: options.hideSandboxStatus,
          hideModelInfo: options.hideModelInfo,
        },
      },
    },
  }) as never;

const renderWithWidth = (
  width: number,
  uiState: UIState,
  settings: LoadedSettings = createDefaultSettings(),
) => {
  useTerminalSizeMock.mockReturnValue({ columns: width, rows: 24 });
  return render(
    <ConfigContext.Provider value={createMockConfig() as never}>
      <SettingsContext.Provider value={settings}>
        <VimModeProvider settings={settings}>
          <UIStateContext.Provider value={uiState}>
            <Footer />
          </UIStateContext.Provider>
        </VimModeProvider>
      </SettingsContext.Provider>
    </ConfigContext.Provider>,
  );
};

describe('<Footer />', () => {
  it('renders the component', () => {
    const { lastFrame } = renderWithWidth(120, createMockUIState());
    expect(lastFrame()).toBeDefined();
  });

  describe('path display', () => {
    it('should display a shortened path on a narrow terminal', () => {
      const { lastFrame } = renderWithWidth(79, createMockUIState());
      const tildePath = tildeifyPath(defaultProps.targetDir);
      const pathLength = Math.max(20, Math.floor(79 * 0.25));
      const expectedPath =
        '...' + tildePath.slice(tildePath.length - pathLength + 3);
      expect(lastFrame()).toContain(expectedPath);
    });

    it('should use wide layout at 80 columns', () => {
      const { lastFrame } = renderWithWidth(80, createMockUIState());
      const tildePath = tildeifyPath(defaultProps.targetDir);
      const expectedPath =
        '...' + tildePath.slice(tildePath.length - 80 * 0.25 + 3);
      expect(lastFrame()).toContain(expectedPath);
    });
  });

  it('displays the branch name when provided', () => {
    const { lastFrame } = renderWithWidth(120, createMockUIState());
    expect(lastFrame()).toContain(`(${defaultProps.branchName}*)`);
  });

  it('does not display the branch name when not provided', () => {
    const { lastFrame } = renderWithWidth(
      120,
      createMockUIState({
        branchName: undefined,
      }),
    );
    expect(lastFrame()).not.toContain(`(${defaultProps.branchName}*)`);
  });

  it('displays the model name and context percentage', () => {
    const { lastFrame } = renderWithWidth(120, createMockUIState());
    expect(lastFrame()).toContain(defaultProps.model);
    expect(lastFrame()).toMatch(/\(\d+% context left\)/);
  });

  it('displays the model name and abbreviated context percentage', () => {
    const { lastFrame } = renderWithWidth(99, createMockUIState());
    expect(lastFrame()).toContain(defaultProps.model);
    expect(lastFrame()).toMatch(/\(\d+%\)/);
  });

  describe('sandbox and trust info', () => {
    it('should display untrusted when isTrustedFolder is false', () => {
      const { lastFrame } = renderWithWidth(
        120,
        createMockUIState({
          isTrustedFolder: false,
        }),
      );
      expect(lastFrame()).toContain('untrusted');
    });

    it('should display custom sandbox info when SANDBOX env is set', () => {
      vi.stubEnv('SANDBOX', 'gemini-cli-test-sandbox');
      const { lastFrame } = renderWithWidth(
        120,
        createMockUIState({
          isTrustedFolder: undefined,
        }),
      );
      expect(lastFrame()).toContain('test');
      vi.unstubAllEnvs();
    });

    it('should display macOS Seatbelt info when SANDBOX is sandbox-exec', () => {
      vi.stubEnv('SANDBOX', 'sandbox-exec');
      vi.stubEnv('SEATBELT_PROFILE', 'test-profile');
      const { lastFrame } = renderWithWidth(
        120,
        createMockUIState({
          isTrustedFolder: true,
        }),
      );
      expect(lastFrame()).toMatch(/macOS Seatbelt.*\(test-profile\)/s);
      vi.unstubAllEnvs();
    });

    it('should display "no sandbox" when SANDBOX is not set and folder is trusted', () => {
      // Clear any SANDBOX env var that might be set.
      vi.stubEnv('SANDBOX', '');
      const { lastFrame } = renderWithWidth(
        120,
        createMockUIState({
          isTrustedFolder: true,
        }),
      );
      expect(lastFrame()).toContain('no sandbox');
      vi.unstubAllEnvs();
    });

    it('should prioritize untrusted message over sandbox info', () => {
      vi.stubEnv('SANDBOX', 'gemini-cli-test-sandbox');
      const { lastFrame } = renderWithWidth(
        120,
        createMockUIState({
          isTrustedFolder: false,
        }),
      );
      expect(lastFrame()).toContain('untrusted');
      expect(lastFrame()).not.toMatch(/test-sandbox/s);
      vi.unstubAllEnvs();
    });
  });

  describe('footer configuration filtering (golden snapshots)', () => {
    it('renders complete footer with all sections visible (baseline)', () => {
      const { lastFrame } = renderWithWidth(120, createMockUIState());
      expect(lastFrame()).toMatchSnapshot('complete-footer-wide');
    });

    it('renders footer with all optional sections hidden (minimal footer)', () => {
      const { lastFrame } = renderWithWidth(
        120,
        createMockUIState(),
        createDefaultSettings({
          hideCWD: true,
          hideSandboxStatus: true,
          hideModelInfo: true,
        }),
      );
      expect(lastFrame()).toMatchSnapshot('footer-minimal');
    });

    it('renders footer with only model info hidden (partial filtering)', () => {
      const { lastFrame } = renderWithWidth(
        120,
        createMockUIState(),
        createDefaultSettings({
          hideCWD: false,
          hideSandboxStatus: false,
          hideModelInfo: true,
        }),
      );
      expect(lastFrame()).toMatchSnapshot('footer-no-model');
    });

    it('renders footer with CWD and model info hidden to test alignment (only sandbox visible)', () => {
      const { lastFrame } = renderWithWidth(
        120,
        createMockUIState(),
        createDefaultSettings({
          hideCWD: true,
          hideSandboxStatus: false,
          hideModelInfo: true,
        }),
      );
      expect(lastFrame()).toMatchSnapshot('footer-only-sandbox');
    });

    it('renders complete footer in narrow terminal (baseline narrow)', () => {
      const { lastFrame } = renderWithWidth(79, createMockUIState());
      expect(lastFrame()).toMatchSnapshot('complete-footer-narrow');
    });
  });
});
