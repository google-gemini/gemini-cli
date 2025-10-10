/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { AnsiOutputText } from './AnsiOutput.js';
import type { AnsiOutput, AnsiToken } from '@google/gemini-cli-core';

// Helper to create a valid AnsiToken with default values
const createAnsiToken = (overrides: Partial<AnsiToken>): AnsiToken => ({
  text: '',
  bold: false,
  italic: false,
  underline: false,
  dim: false,
  inverse: false,
  fg: '#ffffff',
  bg: '#000000',
  ...overrides,
});

describe('<AnsiOutputText />', () => {
  it('renders a simple AnsiOutput object correctly', () => {
    const data: AnsiOutput = [
      [
        createAnsiToken({ text: 'Hello, ' }),
        createAnsiToken({ text: 'world!' }),
      ],
    ];
    const { lastFrame } = render(<AnsiOutputText data={data} width={80} />);
    expect(lastFrame()).toBe('Hello, world!');
  });

  it('correctly applies all the styles', () => {
    const data: AnsiOutput = [
      [
        createAnsiToken({ text: 'Bold', bold: true }),
        createAnsiToken({ text: 'Italic', italic: true }),
        createAnsiToken({ text: 'Underline', underline: true }),
        createAnsiToken({ text: 'Dim', dim: true }),
        createAnsiToken({ text: 'Inverse', inverse: true }),
      ],
    ];
    // Note: ink-testing-library doesn't render styles, so we can only check the text.
    // We are testing that it renders without crashing.
    const { lastFrame } = render(<AnsiOutputText data={data} width={80} />);
    expect(lastFrame()).toBe('BoldItalicUnderlineDimInverse');
  });

  it('correctly applies foreground and background colors', () => {
    const data: AnsiOutput = [
      [
        createAnsiToken({ text: 'Red FG', fg: '#ff0000' }),
        createAnsiToken({ text: 'Blue BG', bg: '#0000ff' }),
      ],
    ];
    // Note: ink-testing-library doesn't render colors, so we can only check the text.
    // We are testing that it renders without crashing.
    const { lastFrame } = render(<AnsiOutputText data={data} width={80} />);
    expect(lastFrame()).toBe('Red FGBlue BG');
  });

  it('handles empty lines and empty tokens', () => {
    const data: AnsiOutput = [
      [createAnsiToken({ text: 'First line' })],
      [],
      [createAnsiToken({ text: 'Third line' })],
      [createAnsiToken({ text: '' })],
    ];
    const { lastFrame } = render(<AnsiOutputText data={data} width={80} />);
    const output = lastFrame();
    expect(output).toBeDefined();
    const lines = output!.split('\n');
    expect(lines[0]).toBe('First line');
    expect(lines[1]).toBe('Third line');
  });

  it('respects the availableTerminalHeight prop and slices the lines correctly', () => {
    const data: AnsiOutput = [
      [createAnsiToken({ text: 'Line 1' })],
      [createAnsiToken({ text: 'Line 2' })],
      [createAnsiToken({ text: 'Line 3' })],
      [createAnsiToken({ text: 'Line 4' })],
    ];
    const { lastFrame } = render(
      <AnsiOutputText data={data} availableTerminalHeight={2} width={80} />,
    );
    const output = lastFrame();
    expect(output).not.toContain('Line 1');
    expect(output).not.toContain('Line 2');
    expect(output).toContain('Line 3');
    expect(output).toContain('Line 4');
  });

  it('renders a large AnsiOutput object without crashing', () => {
    const largeData: AnsiOutput = [];
    for (let i = 0; i < 1000; i++) {
      largeData.push([createAnsiToken({ text: `Line ${i}` })]);
    }
    const { lastFrame } = render(
      <AnsiOutputText data={largeData} width={80} />,
    );
    // We are just checking that it renders something without crashing.
    expect(lastFrame()).toBeDefined();
  });
});
