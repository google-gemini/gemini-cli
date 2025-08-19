/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Header } from './Header.js';
import * as useTerminalSize from '../hooks/useTerminalSize.js';
import { longAsciiLogo } from './AsciiArt.js';

vi.mock('../hooks/useTerminalSize.js');

describe('<Header />', () => {
  beforeEach(() => {});

  it('renders the long logo on a wide terminal', () => {
    vi.spyOn(useTerminalSize, 'useTerminalSize').mockReturnValue({
      columns: 120,
      rows: 20,
    });
    const { lastFrame } = render(
      <Header
        version="1.0.0"
        nightly={false}
        targetDir="/test/dir"
        branchName="test-branch"
      />,
    );
    expect(lastFrame()).toContain(longAsciiLogo);
  });

  it('renders custom ASCII art when provided', () => {
    const customArt = 'CUSTOM ART';
    const { lastFrame } = render(
      <Header
        version="1.0.0"
        nightly={false}
        customAsciiArt={customArt}
        targetDir="/test/dir"
        branchName="test-branch"
      />,
    );
    expect(lastFrame()).toContain(customArt);
  });

  it('displays the version number when nightly is true', () => {
    const { lastFrame } = render(
      <Header
        version="1.0.0"
        nightly={true}
        targetDir="/test/dir"
        branchName="test-branch"
      />,
    );
    expect(lastFrame()).toContain('v1.0.0');
  });

  it('does not display the version number when nightly is false', () => {
    const { lastFrame } = render(
      <Header
        version="1.0.0"
        nightly={false}
        targetDir="/test/dir"
        branchName="test-branch"
      />,
    );
    expect(lastFrame()).not.toContain('v1.0.0');
  });

  it('displays the target directory and branch name', () => {
    const { lastFrame } = render(
      <Header
        version="1.0.0"
        nightly={false}
        targetDir="/test/dir"
        branchName="test-branch"
      />,
    );
    expect(lastFrame()).toContain('/test/dir');
    expect(lastFrame()).toContain('(test-branch)');
  });
});
