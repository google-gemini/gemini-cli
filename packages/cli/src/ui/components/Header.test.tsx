/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { Header } from './Header.js';
import * as useTerminalSize from '../hooks/useTerminalSize.js';
import { longAsciiLogo } from './AsciiArt.js';

vi.mock('../hooks/useTerminalSize.js');

describe('<Header />', () => {
  it('renders the long logo on a wide terminal', () => {
    vi.spyOn(useTerminalSize, 'useTerminalSize').mockReturnValue({
      columns: 120,
      rows: 20,
    });
    const { lastFrame } = render(<Header version="1.0.0" nightly={false} />);
    expect(lastFrame()?.trim()).toContain(longAsciiLogo.trim());
  });

  it('renders custom ASCII art when provided', () => {
    const customArt = 'CUSTOM ART';
    const { lastFrame } = render(
      <Header version="1.0.0" nightly={false} customAsciiArt={customArt} />,
    );
    expect(lastFrame()?.trim()).toContain(customArt);
  });

  it('displays the version number when nightly is true', () => {
    const { lastFrame } = render(<Header version="1.0.0" nightly={true} />);
    expect(lastFrame()?.trim()).toContain('v1.0.0');
  });

  it('does not display the version number when nightly is false', () => {
    vi.spyOn(useTerminalSize, 'useTerminalSize').mockReturnValue({
      columns: 40,
      rows: 20,
    });
    const { lastFrame } = render(<Header version="1.0.0" nightly={false} />);
    expect(lastFrame()?.trim()).not.toContain('v1.0.0');
  });
});
