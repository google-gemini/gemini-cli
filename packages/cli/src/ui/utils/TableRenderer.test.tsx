/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { TableRenderer } from './TableRenderer.js';
import { renderWithProviders } from '../../test-utils/render.js';

describe('TableRenderer', () => {
  it('renders a 3x3 table correctly', () => {
    const headers = ['Header 1', 'Header 2', 'Header 3'];
    const rows = [
      ['Row 1, Col 1', 'Row 1, Col 2', 'Row 1, Col 3'],
      ['Row 2, Col 1', 'Row 2, Col 2', 'Row 2, Col 3'],
      ['Row 3, Col 1', 'Row 3, Col 2', 'Row 3, Col 3'],
    ];
    const terminalWidth = 80;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Header 1');
    expect(output).toContain('Row 1, Col 1');
    expect(output).toContain('Row 3, Col 3');
    expect(output).toMatchSnapshot();
  });

  it('renders a table with long headers and 4 columns correctly', () => {
    const headers = [
      'Very Long Column Header One',
      'Very Long Column Header Two',
      'Very Long Column Header Three',
      'Very Long Column Header Four',
    ];
    const rows = [
      ['Data 1.1', 'Data 1.2', 'Data 1.3', 'Data 1.4'],
      ['Data 2.1', 'Data 2.2', 'Data 2.3', 'Data 2.4'],
      ['Data 3.1', 'Data 3.2', 'Data 3.3', 'Data 3.4'],
    ];
    const terminalWidth = 80;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    // Since terminalWidth is 80 and headers are long, they might be truncated.
    // We just check for some of the content.
    expect(output).toContain('Data 1.1');
    expect(output).toContain('Data 3.4');
    expect(output).toMatchSnapshot();
  });

  it('wraps long cell content correctly', () => {
    const headers = ['Col 1', 'Col 2'];
    const rows = [
      [
        'Short',
        'This is a very long cell content that should wrap to multiple lines',
      ],
    ];
    const terminalWidth = 40;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('This is a very');
    expect(output).toContain('long cell');
    expect(output).toMatchSnapshot();
  });

  it('wraps all long columns correctly', () => {
    const headers = ['Col 1', 'Col 2'];
    const rows = [
      [
        'This is a very long text that needs wrapping in column 1',
        'This is also a very long text that needs wrapping in column 2',
      ],
    ];
    const terminalWidth = 50;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('wrapping in');
    expect(output).toMatchSnapshot();
  });

  it('wraps mixed long and short columns correctly', () => {
    const headers = ['Short', 'Long'];
    const rows = [
      [
        'Tiny',
        'This is a very long text that definitely needs to wrap to the next line',
      ],
    ];
    const terminalWidth = 40;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Tiny');
    expect(output).toContain('definitely needs');
    expect(output).toMatchSnapshot();
  });

  it('wraps columns with punctuation correctly', () => {
    const headers = ['Punctuation'];
    const rows = [
      ['Start. Stop. Comma, separated. Exclamation! Question? hyphen-ated'],
    ];
    const terminalWidth = 30;

    const { lastFrame } = renderWithProviders(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Start. Stop.');
    expect(output).toMatchSnapshot();
  });
});
