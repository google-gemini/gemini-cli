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
import path from 'node:path';

vi.mock('../hooks/useTerminalSize.js');
const useTerminalSizeMock = vi.mocked(useTerminalSize.useTerminalSize);

// Create a configurable mock function for different languages
const mockTranslation = vi.fn((key: string, options?: { percent?: string }) => {
  const translations: Record<
    string,
    string | ((opts: { percent?: string }) => string)
  > = {
    'footer.noSandbox': 'no sandbox',
    'footer.seeDocsHint': '(see /docs)',
    'footer.untrusted': 'untrusted',
    'ui:contextUsage.remaining': (opts: { percent: string }) =>
      `${opts.percent}% context left`,
  };
  const translation = translations[key];
  if (typeof translation === 'function') {
    return translation(options);
  }
  return translation || key;
});

vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(() => ({
    t: mockTranslation,
  })),
}));

vi.mock('../../i18n/useTranslation.js', () => ({
  useTranslation: vi.fn(() => ({
    t: mockTranslation,
  })),
}));

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
  debugMode: false,
  debugMessage: '',
  corgiMode: false,
  errorCount: 0,
  showErrorDetails: false,
  showMemoryUsage: false,
  promptTokenCount: 100,
  nightly: false,
};

const renderWithWidth = (width: number, props = defaultProps) => {
  useTerminalSizeMock.mockReturnValue({ columns: width, rows: 24 });
  return render(<Footer {...props} />);
};

describe('<Footer />', () => {
  it('renders the component', () => {
    const { lastFrame } = renderWithWidth(120);
    expect(lastFrame()).toBeDefined();
  });

  describe('path display', () => {
    it('should display shortened path on a wide terminal', () => {
      const { lastFrame } = renderWithWidth(120);
      const tildePath = tildeifyPath(defaultProps.targetDir);
      const expectedPath = '...' + tildePath.slice(tildePath.length - 48 + 3);
      expect(lastFrame()).toContain(expectedPath);
    });

    it('should display only the base directory name on a narrow terminal', () => {
      const { lastFrame } = renderWithWidth(79);
      const expectedPath = path.basename(defaultProps.targetDir);
      expect(lastFrame()).toContain(expectedPath);
    });

    it('should use wide layout at 80 columns', () => {
      const { lastFrame } = renderWithWidth(80);
      const tildePath = tildeifyPath(defaultProps.targetDir);
      const expectedPath = '...' + tildePath.slice(tildePath.length - 32 + 3);
      expect(lastFrame()).toContain(expectedPath);
    });

    it('should use narrow layout at 79 columns', () => {
      const { lastFrame } = renderWithWidth(79);
      const expectedPath = path.basename(defaultProps.targetDir);
      expect(lastFrame()).toContain(expectedPath);
      const tildePath = tildeifyPath(defaultProps.targetDir);
      const unexpectedPath = '...' + tildePath.slice(tildePath.length - 31 + 3);
      expect(lastFrame()).not.toContain(unexpectedPath);
    });
  });

  it('displays the branch name when provided', () => {
    const { lastFrame } = renderWithWidth(120);
    expect(lastFrame()).toContain(`(${defaultProps.branchName}*)`);
  });

  it('does not display the branch name when not provided', () => {
    const { lastFrame } = renderWithWidth(120, {
      ...defaultProps,
      branchName: undefined,
    });
    expect(lastFrame()).not.toContain(`(${defaultProps.branchName}*)`);
  });

  it('displays the model name and context percentage', () => {
    const { lastFrame } = renderWithWidth(120);
    expect(lastFrame()).toContain(defaultProps.model);
    expect(lastFrame()).toMatch(/\(\d+% context[\s\S]*left\)/);
  });

  describe('sandbox and trust info', () => {
    it('should display untrusted when isTrustedFolder is false', () => {
      const { lastFrame } = renderWithWidth(120, {
        ...defaultProps,
        isTrustedFolder: false,
      });
      expect(lastFrame()).toContain('untrusted');
    });

    it('should display custom sandbox info when SANDBOX env is set', () => {
      vi.stubEnv('SANDBOX', 'gemini-cli-test-sandbox');
      const { lastFrame } = renderWithWidth(120, {
        ...defaultProps,
        isTrustedFolder: undefined,
      });
      expect(lastFrame()).toContain('test');
      vi.unstubAllEnvs();
    });

    it('should display macOS Seatbelt info when SANDBOX is sandbox-exec', () => {
      vi.stubEnv('SANDBOX', 'sandbox-exec');
      vi.stubEnv('SEATBELT_PROFILE', 'test-profile');
      const { lastFrame } = renderWithWidth(120, {
        ...defaultProps,
        isTrustedFolder: true,
      });
      expect(lastFrame()).toMatch(/macOS Seatbelt.*\(test-profile\)/s);
      vi.unstubAllEnvs();
    });

    it('should display "no sandbox" when SANDBOX is not set and folder is trusted', () => {
      // Clear any SANDBOX env var that might be set.
      vi.stubEnv('SANDBOX', '');
      const { lastFrame } = renderWithWidth(120, {
        ...defaultProps,
        isTrustedFolder: true,
      });
      expect(lastFrame()).toContain('no sandbox');
      vi.unstubAllEnvs();
    });

    it('should prioritize untrusted message over sandbox info', () => {
      vi.stubEnv('SANDBOX', 'gemini-cli-test-sandbox');
      const { lastFrame } = renderWithWidth(120, {
        ...defaultProps,
        isTrustedFolder: false,
      });
      expect(lastFrame()).toContain('untrusted');
      expect(lastFrame()).not.toMatch(/test-sandbox/s);
      vi.unstubAllEnvs();
    });
  });
});

describe('Footer - Multi-language Support', () => {
  beforeEach(() => {
    useTerminalSizeMock.mockReturnValue({ columns: 120, rows: 24 });
    vi.clearAllMocks();
  });

  describe('Chinese Language (zh)', () => {
    beforeEach(() => {
      // Configure mock for Chinese translations
      mockTranslation.mockImplementation(
        (key: string, options?: { percent?: string }) => {
          const chineseTranslations: Record<
            string,
            string | ((opts: { percent?: string }) => string)
          > = {
            'footer.noSandbox': '无沙箱',
            'footer.seeDocsHint': '(查看 /docs)',
            'footer.untrusted': '不受信任',
            'ui:contextUsage.remaining': (opts: { percent: string }) =>
              `对话空间剩余${opts.percent}%`,
          };
          const translation = chineseTranslations[key];
          if (typeof translation === 'function') {
            return translation(options);
          }
          return translation || key;
        },
      );
    });

    it('should display Chinese no sandbox message', () => {
      const { lastFrame } = render(<Footer {...defaultProps} />);
      expect(lastFrame()).toContain('无沙箱');
      expect(lastFrame()).toContain('查看');
      expect(lastFrame()).toContain('/docs');
    });

    it('should display Chinese untrusted folder message', () => {
      const { lastFrame } = render(
        <Footer {...defaultProps} isTrustedFolder={false} />,
      );
      expect(lastFrame()).toContain('不受信任');
    });

    it('should display Chinese context usage with correct interpolation', () => {
      const { lastFrame } = render(
        <Footer {...defaultProps} promptTokenCount={1000} />,
      );
      // Should contain Chinese context usage text with percentage
      expect(lastFrame()).toMatch(/对话空间剩余.*\d+%/);
    });

    it('should display Chinese sandbox status when environment variable is set', () => {
      vi.stubEnv('SANDBOX', 'gemini-test-sandbox');
      const { lastFrame } = render(<Footer {...defaultProps} />);
      expect(lastFrame()).toContain('test-sandbox');
      vi.unstubAllEnvs();
    });
  });

  describe('French Language (fr)', () => {
    beforeEach(() => {
      // Configure mock for French translations (example)
      mockTranslation.mockImplementation(
        (key: string, options?: { percent?: string }) => {
          const frenchTranslations: Record<
            string,
            string | ((opts: { percent?: string }) => string)
          > = {
            'footer.noSandbox': 'pas de bac à sable',
            'footer.seeDocsHint': '(voir /docs)',
            'footer.untrusted': 'non fiable',
            'ui:contextUsage.remaining': (opts: { percent: string }) =>
              `${opts.percent}% du contexte restant`,
          };
          const translation = frenchTranslations[key];
          if (typeof translation === 'function') {
            return translation(options);
          }
          return translation || key;
        },
      );
    });

    it('should display French no sandbox message', () => {
      const { lastFrame } = render(<Footer {...defaultProps} />);
      expect(lastFrame()).toContain('pas de bac à sable');
      expect(lastFrame()).toContain('(voir /docs)');
    });

    it('should display French untrusted folder message', () => {
      const { lastFrame } = render(
        <Footer {...defaultProps} isTrustedFolder={false} />,
      );
      expect(lastFrame()).toContain('non');
      expect(lastFrame()).toContain('fiable');
    });

    it('should display French context usage with correct interpolation', () => {
      const { lastFrame } = render(
        <Footer {...defaultProps} promptTokenCount={1500} />,
      );
      // Should contain French context usage text with percentage (may be split across lines)
      expect(lastFrame()).toMatch(/\d+%[\s\S]*du contexte[\s\S]*restant/);
    });
  });

  describe('Multi-language Regression Test', () => {
    beforeEach(() => {
      // Reset to English translations to ensure original functionality still works
      mockTranslation.mockImplementation(
        (key: string, options?: { percent?: string }) => {
          const englishTranslations: Record<
            string,
            string | ((opts: { percent?: string }) => string)
          > = {
            'footer.noSandbox': 'no sandbox',
            'footer.seeDocsHint': '(see /docs)',
            'footer.untrusted': 'untrusted',
            'ui:contextUsage.remaining': (opts: { percent: string }) =>
              `${opts.percent}% context left`,
          };
          const translation = englishTranslations[key];
          if (typeof translation === 'function') {
            return translation(options);
          }
          return translation || key;
        },
      );
    });

    it('should still work correctly in English after adding multi-language support', () => {
      const { lastFrame } = render(
        <Footer {...defaultProps} isTrustedFolder={false} />,
      );
      expect(lastFrame()).toContain('untrusted');
      // For the regression test, we only test with untrusted folder which doesn't show sandbox info
    });
  });

  describe('Translation Fallback Behavior', () => {
    beforeEach(() => {
      // Configure mock to return raw keys (simulating missing translations)
      mockTranslation.mockImplementation((key: string) => key);
    });

    it('should gracefully handle missing translations', () => {
      const { lastFrame } = render(
        <Footer {...defaultProps} isTrustedFolder={false} />,
      );
      expect(lastFrame()).toContain('footer.untrus'); // May be split due to width
      expect(lastFrame()).toContain('ted');
    });

    it('should handle missing interpolation translations', () => {
      const { lastFrame } = render(
        <Footer {...defaultProps} promptTokenCount={2000} />,
      );
      expect(lastFrame()).toContain('ui:contextUsage.remaining');
    });
  });
});
