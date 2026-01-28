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
});
