/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TableRenderer } from './TableRenderer.js';
import { render } from '../../test-utils/render.js';

describe('<TableRenderer />', () => {
  it('renders a 3x3 table', () => {
    const headers = ['Column 1', 'Column 2', 'Column 3'];
    const rows = [
      ['1', '2', '3'],
      ['A', 'Longer than the header', 'C'],
    ];
    const terminalWidth = 80;

    const { lastFrame } = render(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a 3x1 table', () => {
    const headers = ['Column 1'];
    const rows = [['1'], ['A']];
    const terminalWidth = 80;

    const { lastFrame } = render(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a 1x3 table', () => {
    const headers = ['Column 1', 'Column 2', 'Column 3'];
    const rows: string[][] = [];
    const terminalWidth = 80;

    const { lastFrame } = render(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders inline Markdown', () => {
    const headers = ['Column 1', '**Column 2**', 'Column 3'];
    const rows = [['1', '2', '_3_']];
    const terminalWidth = 80;

    const { lastFrame } = render(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('truncates overflowing headers', () => {
    const headers = [
      'Column 1',
      'Column 2',
      'This is a very long column header that should trigger overflow.',
      'Column 4',
    ];
    const rows = [
      ['1', '2', '3', '4'],
      ['A', 'B', 'C', 'D'],
    ];
    const terminalWidth = 80;

    const { lastFrame } = render(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('truncates overflowing table cells', () => {
    const headers = ['Column 1', 'Column 2', 'Column 3', 'Column 4'];
    const rows = [
      [
        '1',
        'This is a very long table cell that should trigger overflow.',
        '3',
        '4',
      ],
      ['A', 'B', 'C', 'D'],
    ];
    const terminalWidth = 80;

    const { lastFrame } = render(
      <TableRenderer
        headers={headers}
        rows={rows}
        terminalWidth={terminalWidth}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
