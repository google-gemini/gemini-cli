/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { render } from '../../test-utils/render.js';
import { TableRenderer } from './TableRenderer.js';

describe('TableRenderer', () => {
  it('renders a simple table correctly', () => {
    const headers = ['Name', 'Role', 'Status'];
    const rows = [
      ['Alice', 'Engineer', 'Active'],
      ['Bob', 'Designer', 'Inactive'],
      ['Charlie', 'Manager', 'Active'],
    ];

    const { lastFrame } = render(
      <TableRenderer headers={headers} rows={rows} terminalWidth={80} />,
    );
    const output = lastFrame();

    expect(output).toContain('Name');
    expect(output).toContain('Role');
    expect(output).toContain('Status');
    expect(output).toContain('Alice');
    expect(output).toContain('Engineer');
    expect(output).toContain('Active');
    expect(output).toMatchSnapshot();
  });

  it('handles empty rows', () => {
    const headers = ['Name', 'Role', 'Status'];
    const rows: string[][] = [];

    const { lastFrame } = render(
      <TableRenderer headers={headers} rows={rows} terminalWidth={80} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('handles rows with missing cells', () => {
    const headers = ['Name', 'Role', 'Status'];
    const rows = [['Alice', 'Engineer'], ['Bob']];

    const { lastFrame } = render(
      <TableRenderer headers={headers} rows={rows} terminalWidth={80} />,
    );

    expect(lastFrame()).toContain('Alice');
    expect(lastFrame()).toContain('Bob');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('handles markdown content in cells', () => {
    const headers = ['Name', 'Role', 'Status'];
    const rows = [['**Alice**', '_Engineer_', '`Active`']];

    const { lastFrame } = render(
      <TableRenderer headers={headers} rows={rows} terminalWidth={80} />,
    );

    expect(lastFrame()).toContain('Alice');
    expect(lastFrame()).toContain('Engineer');
    expect(lastFrame()).toContain('Active');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('wraps long content to multiple lines instead of truncating', () => {
    const headers = ['Name', 'Description'];
    const rows = [
      [
        'Alice',
        'This is a very long description that should wrap to multiple lines instead of being truncated',
      ],
    ];

    const { lastFrame } = render(
      <TableRenderer headers={headers} rows={rows} terminalWidth={50} />,
    );
    const output = lastFrame()!;

    expect(output).not.toContain('...');

    expect(output).toContain('very');
    expect(output).toContain('long');
    expect(output).toContain('description');
    expect(output).toContain('wrap');
    expect(output).toContain('multiple');
    expect(output).toContain('lines');
    expect(output).toContain('truncated');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('wraps content when terminal width is small', () => {
    const headers = ['Name', 'Role', 'Status'];
    const rows = [
      ['Alice', 'Engineer', 'Active'],
      ['Bob', 'Designer', 'Inactive'],
      ['Charlie', 'Manager', 'Active'],
    ];

    const { lastFrame } = render(
      <TableRenderer headers={headers} rows={rows} terminalWidth={40} />,
    );
    const output = lastFrame()!;

    expect(output).toContain('Alice');
    expect(output).toContain('Bob');
    expect(output).toContain('Charlie');
    expect(output).toContain('Engineer');
    expect(output).toContain('Designer');
    expect(output).toContain('Manager');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('wraps long markdown content correctly', () => {
    const headers = ['Name', 'Role', 'Status'];
    const rows = [
      [
        'Alice with a very long name that should wrap',
        'Engineer',
        'Active and ready to work',
      ],
    ];

    const { lastFrame } = render(
      <TableRenderer headers={headers} rows={rows} terminalWidth={100} />,
    );
    const output = lastFrame()!;

    expect(output).toContain('Alice');
    expect(output).toContain('very');
    expect(output).toContain('long');
    expect(output).toContain('name');
    expect(output).toContain('wrap');
    expect(output).toContain('Engineer');
    expect(output).toContain('Active');
    expect(output).toContain('ready');
    expect(output).toContain('work');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('handles very narrow terminal width', () => {
    const headers = ['A', 'B'];
    const rows = [['Value1', 'Value2']];

    const { lastFrame } = render(
      <TableRenderer headers={headers} rows={rows} terminalWidth={20} />,
    );
    const output = lastFrame()!;

    expect(output).toBeDefined();
    expect(output).toContain('A');
    expect(output).toContain('B');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders table borders correctly', () => {
    const headers = ['Col1', 'Col2'];
    const rows = [['A', 'B']];

    const { lastFrame } = render(
      <TableRenderer headers={headers} rows={rows} terminalWidth={80} />,
    );
    const output = lastFrame()!;

    expect(output).toContain('┌');
    expect(output).toContain('┐');
    expect(output).toContain('├');
    expect(output).toContain('┤');
    expect(output).toContain('└');
    expect(output).toContain('┘');
    expect(output).toContain('─');
    expect(output).toContain('│');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('handles cells with multiple words wrapping correctly', () => {
    const headers = ['Feature', 'Description'];
    const rows = [
      [
        'AWS',
        'Largest market share, most mature platform with extensive services',
      ],
      ['GCP', 'Third-largest market share, known for AI and ML capabilities'],
      ['Azure', 'Second-largest market share, strong enterprise integration'],
    ];

    const { lastFrame } = render(
      <TableRenderer headers={headers} rows={rows} terminalWidth={60} />,
    );
    const output = lastFrame()!;

    expect(output).toContain('AWS');
    expect(output).toContain('GCP');
    expect(output).toContain('Azure');
    expect(output).toContain('market');
    expect(output).toContain('share');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('preserves word boundaries when wrapping', () => {
    const headers = ['Title'];
    const rows = [['Hello world this is a test of word wrapping']];

    const { lastFrame } = render(
      <TableRenderer headers={headers} rows={rows} terminalWidth={25} />,
    );
    const output = lastFrame()!;

    expect(output).toContain('Hello');
    expect(output).toContain('world');
    expect(output).toContain('this');
    expect(output).toContain('test');
    expect(output).toContain('word');
    expect(output).toContain('wrapping');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('handles single column table', () => {
    const headers = ['Items'];
    const rows = [['First item'], ['Second item'], ['Third item']];

    const { lastFrame } = render(
      <TableRenderer headers={headers} rows={rows} terminalWidth={80} />,
    );
    const output = lastFrame()!;

    expect(output).toContain('Items');
    expect(output).toContain('First item');
    expect(output).toContain('Second item');
    expect(output).toContain('Third item');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('handles many columns', () => {
    const headers = ['A', 'B', 'C', 'D', 'E', 'F'];
    const rows = [['1', '2', '3', '4', '5', '6']];

    const { lastFrame } = render(
      <TableRenderer headers={headers} rows={rows} terminalWidth={80} />,
    );
    const output = lastFrame()!;

    expect(output).toContain('A');
    expect(output).toContain('B');
    expect(output).toContain('C');
    expect(output).toContain('D');
    expect(output).toContain('E');
    expect(output).toContain('F');
    expect(lastFrame()).toMatchSnapshot();
  });
});
