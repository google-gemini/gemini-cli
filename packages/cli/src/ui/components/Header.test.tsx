/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Header } from './Header.js';
import * as useTerminalSize from '../hooks/useTerminalSize.js';
import { longAsciiLogo, longAsciiLogoIde } from './AsciiArt.js';
import * as semanticColors from '../semantic-colors.js';
import * as terminalSetup from '../utils/terminalSetup.js';
import { Text } from 'ink';
import type React from 'react';

vi.mock('../hooks/useTerminalSize.js');
vi.mock('../hooks/useSnowfall.js', () => ({
  useSnowfall: vi.fn((art) => art),
}));
vi.mock('../utils/terminalSetup.js', () => ({
  getTerminalProgram: vi.fn(),
}));
vi.mock('ink-gradient', () => {
  const MockGradient = ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  );
  return {
    default: vi.fn(MockGradient),
  };
});
vi.mock('../semantic-colors.js');
vi.mock('ink', async () => {
  const originalInk = await vi.importActual<typeof import('ink')>('ink');
  return {
    ...originalInk,
    Text: vi.fn(originalInk.Text),
  };
});

describe('<Header />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(terminalSetup.getTerminalProgram).mockReturnValue(null);
  });

  it('renders the long logo on a wide terminal', () => {
    vi.spyOn(useTerminalSize, 'useTerminalSize').mockReturnValue({
      columns: 120,
      rows: 20,
    });
    render(<Header version="1.0.0" nightly={false} />);
    expect(Text).toHaveBeenCalledWith(
      expect.objectContaining({
        children: longAsciiLogo,
      }),
      undefined,
    );
  });

  it('uses the IDE logo when running in an IDE', () => {
    vi.spyOn(useTerminalSize, 'useTerminalSize').mockReturnValue({
      columns: 120,
      rows: 20,
    });
    vi.mocked(terminalSetup.getTerminalProgram).mockReturnValue('vscode');

    render(<Header version="1.0.0" nightly={false} />);
    expect(Text).toHaveBeenCalledWith(
      expect.objectContaining({
        children: longAsciiLogoIde,
      }),
      undefined,
    );
  });

  it('renders custom ASCII art when provided', () => {
    const customArt = 'CUSTOM ART';
    render(
      <Header version="1.0.0" nightly={false} customAsciiArt={customArt} />,
    );
    expect(Text).toHaveBeenCalledWith(
      expect.objectContaining({
        children: customArt,
      }),
      undefined,
    );
  });

  it('renders custom ASCII art as is when running in an IDE', () => {
    const customArt = 'CUSTOM ART';
    vi.mocked(terminalSetup.getTerminalProgram).mockReturnValue('vscode');
    render(
      <Header version="1.0.0" nightly={false} customAsciiArt={customArt} />,
    );
    expect(Text).toHaveBeenCalledWith(
      expect.objectContaining({
        children: customArt,
      }),
      undefined,
    );
  });

  it('displays the version number when nightly is true', () => {
    render(<Header version="1.0.0" nightly={true} />);
    const textCalls = (Text as Mock).mock.calls;
    expect(textCalls[1][0].children.join('')).toBe('v1.0.0');
  });

  it('does not display the version number when nightly is false', () => {
    render(<Header version="1.0.0" nightly={false} />);
    expect(Text).not.toHaveBeenCalledWith(
      expect.objectContaining({
        children: 'v1.0.0',
      }),
      undefined,
    );
  });

  it('renders with no gradient when theme.ui.gradient is undefined', async () => {
    vi.spyOn(semanticColors, 'theme', 'get').mockReturnValue({
      text: {
        primary: '',
        secondary: '',
        link: '',
        accent: '#123456',
        response: '',
      },
      background: {
        primary: '',
        diff: { added: '', removed: '' },
      },
      border: {
        default: '',
        focused: '',
      },
      ui: {
        comment: '',
        symbol: '',
        dark: '',
        gradient: undefined,
      },
      status: {
        error: '',
        success: '',
        warning: '',
      },
    });
    const Gradient = await import('ink-gradient');
    render(<Header version="1.0.0" nightly={false} />);
    expect(Gradient.default).not.toHaveBeenCalled();
    const textCalls = (Text as Mock).mock.calls;
    expect(textCalls[0][0]).toHaveProperty('color', '#123456');
  });

  it('renders with a single color when theme.ui.gradient has one color', async () => {
    const singleColor = '#FF0000';
    vi.spyOn(semanticColors, 'theme', 'get').mockReturnValue({
      ui: { gradient: [singleColor] },
    } as typeof semanticColors.theme);
    const Gradient = await import('ink-gradient');
    render(<Header version="1.0.0" nightly={false} />);
    expect(Gradient.default).not.toHaveBeenCalled();
    const textCalls = (Text as Mock).mock.calls;
    expect(textCalls.length).toBe(1);
    expect(textCalls[0][0]).toHaveProperty('color', singleColor);
  });

  it('renders with a gradient when theme.ui.gradient has two or more colors', async () => {
    const gradientColors = ['#FF0000', '#00FF00'];
    vi.spyOn(semanticColors, 'theme', 'get').mockReturnValue({
      ui: { gradient: gradientColors },
    } as typeof semanticColors.theme);
    const Gradient = await import('ink-gradient');
    render(<Header version="1.0.0" nightly={false} />);
    expect(Gradient.default).toHaveBeenCalledWith(
      expect.objectContaining({
        colors: gradientColors,
      }),
      undefined,
    );
  });
});
