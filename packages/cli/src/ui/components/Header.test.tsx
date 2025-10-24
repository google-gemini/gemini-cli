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
import * as semanticColors from '../semantic-colors.js';

vi.mock('../hooks/useTerminalSize.js');
vi.mock('ink-gradient', () => {
  const MockGradient = ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  );
  return {
    default: vi.fn(MockGradient),
  };
});
vi.mock('../semantic-colors.js');

describe('<Header />', () => {
  beforeEach(() => {});

  it('renders the long logo on a wide terminal', () => {
    vi.spyOn(useTerminalSize, 'useTerminalSize').mockReturnValue({
      columns: 120,
      rows: 20,
    });
    const { lastFrame } = render(<Header version="1.0.0" nightly={false} />);
    expect(lastFrame()).toContain(longAsciiLogo);
  });

  it('renders custom ASCII art when provided', () => {
    const customArt = 'CUSTOM ART';
    const { lastFrame } = render(
      <Header version="1.0.0" nightly={false} customAsciiArt={customArt} />,
    );
    expect(lastFrame()).toContain(customArt);
  });

  it('displays the version number when nightly is true', () => {
    const { lastFrame } = render(<Header version="1.0.0" nightly={true} />);
    expect(lastFrame()).toContain('v1.0.0');
  });

  it('does not display the version number when nightly is false', () => {
    const { lastFrame } = render(<Header version="1.0.0" nightly={false} />);
    expect(lastFrame()).not.toContain('v1.0.0');
  });

  it('uses fallback gradient colors when theme.ui.gradient is undefined', async () => {
    vi.spyOn(semanticColors, 'theme', 'get').mockReturnValue({
      ui: { gradient: undefined },
    } as typeof semanticColors.theme);
    const Gradient = await import('ink-gradient');
    render(<Header version="1.0.0" nightly={false} />);
    expect(Gradient.default).toHaveBeenCalledWith(
      expect.objectContaining({
        colors: ['#4285F4', '#34A853', '#FBBC05', '#EA4335'],
      }),
      undefined,
    );
  });
});
