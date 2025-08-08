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
});
