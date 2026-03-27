/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import { renderWithProviders } from '../../test-utils/render.js';
import { TableRenderer } from './TableRenderer.js';

describe('TableRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic rendering', () => {
    it('should render a simple table with headers and rows', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Name', 'Age']}
          rows={[
            ['Alice', '30'],
            ['Bob', '25'],
          ]}
          terminalWidth={40}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Name');
      expect(text).toContain('Age');
      expect(text).toContain('Alice');
      expect(text).toContain('Bob');
      await expect(lastFrame()).toMatchSvgSnapshot();
    });

    it('should render table with single row', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Column1', 'Column2']}
          rows={[['Value1', 'Value2']]}
          terminalWidth={50}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Column1');
      expect(text).toContain('Value1');
    });

    it('should render table with single column', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Item']}
          rows={[['Item1'], ['Item2'], ['Item3']]}
          terminalWidth={30}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Item');
      expect(text).toContain('Item1');
      expect(text).toContain('Item2');
    });

    it('should render table with many columns', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['A', 'B', 'C', 'D', 'E']}
          rows={[
            ['a1', 'b1', 'c1', 'd1', 'e1'],
            ['a2', 'b2', 'c2', 'd2', 'e2'],
          ]}
          terminalWidth={80}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('A');
      expect(text).toContain('E');
      expect(text).toContain('a1');
      expect(text).toContain('e2');
      await expect(lastFrame()).toMatchSvgSnapshot();
    });

    it('should render table with many rows', async () => {
      const rows = Array.from({ length: 20 }, (_, i) => [
        `Row${i}Col1`,
        `Row${i}Col2`,
      ]);

      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Col1', 'Col2']}
          rows={rows}
          terminalWidth={50}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Row0Col1');
      expect(text).toContain('Row19Col2');
    });
  });

  describe('Content handling', () => {
    it('should handle empty cell values', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Name', 'Value']}
          rows={[
            ['A', ''],
            ['', 'B'],
          ]}
          terminalWidth={40}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Name');
      expect(text).toContain('A');
      expect(text).toContain('B');
    });

    it('should handle long cell content with wrapping', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Name', 'Description']}
          rows={[
            [
              'Item',
              'This is a very long description that should wrap to multiple lines',
            ],
          ]}
          terminalWidth={40}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Item');
      expect(text).toContain('long');
      expect(text).toContain('description');
    });

    it('should handle special characters', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Col1', 'Col2']}
          rows={[
            ['@#$%', 'test!@#'],
            ['123<>', 'abc&def'],
          ]}
          terminalWidth={50}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('@');
      expect(text).toContain('#');
      expect(text).toContain('test');
    });

    it('should handle Unicode characters', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['English', 'Chinese']}
          rows={[
            ['Test', '测试'],
            ['Example', '例子'],
          ]}
          terminalWidth={50}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Test');
      expect(text).toContain('Example');
    });

    it('should handle newlines in cells', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Col1', 'Col2']}
          rows={[['Line1\nLine2', 'Content']]}
          terminalWidth={50}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Content');
    });
  });

  describe('Column width handling', () => {
    it('should adjust column widths based on content', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Short', 'MuchLongerHeader']}
          rows={[['A', 'B']]}
          terminalWidth={60}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Short');
      expect(text).toContain('MuchLongerHeader');
    });

    it('should handle narrow terminal width', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Name', 'Description']}
          rows={[['Item', 'A long description']]}
          terminalWidth={30}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Name');
      expect(text).toContain('Item');
    });

    it('should handle very narrow terminal width with wrapping', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['A', 'B']}
          rows={[['LongValue1', 'LongValue2']]}
          terminalWidth={15}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text.length).toBeGreaterThan(0);
    });

    it('should balance column widths across available terminal width', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Col1', 'Col2', 'Col3']}
          rows={[['A', 'B', 'C']]}
          terminalWidth={80}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Col1');
      expect(text).toContain('Col2');
      expect(text).toContain('Col3');
    });
  });

  describe('Border rendering', () => {
    it('should include table borders', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Name', 'Value']}
          rows={[['Item1', 'Value1']]}
          terminalWidth={50}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toMatch(/[┌│└┐┤┘├┼┬┴─]/);
      await expect(lastFrame()).toMatchSvgSnapshot();
    });

    it('should have proper border structure', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['A', 'B']}
          rows={[
            ['1', '2'],
            ['3', '4'],
          ]}
          terminalWidth={40}
        />,
      );

      const text = stripAnsi(lastFrame());
      const lines = text.split('\n').filter((line) => line.trim());
      expect(lines.length).toBeGreaterThan(3);
      await expect(lastFrame()).toMatchSvgSnapshot();
    });
  });

  describe('Edge cases', () => {
    it('should handle rows with fewer columns than headers', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Col1', 'Col2', 'Col3']}
          rows={[['A', 'B']]}
          terminalWidth={60}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Col1');
      expect(text).toContain('Col3');
    });

    it('should handle rows with more columns than headers', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Col1']}
          rows={[['A', 'B', 'C']]}
          terminalWidth={60}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Col1');
    });

    it('should handle empty headers array', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer headers={[]} rows={[['A', 'B']]} terminalWidth={40} />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('A');
      expect(text).toContain('B');
    });

    it('should handle empty rows array', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Name', 'Value']}
          rows={[]}
          terminalWidth={40}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Name');
      expect(text).toContain('Value');
    });

    it('should handle both empty headers and rows', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer headers={[]} rows={[]} terminalWidth={40} />,
      );

      const frame = lastFrame();
      expect(frame).toBeDefined();
    });

    it('should handle very wide terminal width', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Col1', 'Col2']}
          rows={[['A', 'B']]}
          terminalWidth={500}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Col1');
      expect(text).toContain('A');
    });
  });

  describe('Performance', () => {
    it('should render large tables without crashing', async () => {
      const headers = Array.from({ length: 10 }, (_, i) => `Col${i}`);
      const rows = Array.from({ length: 50 }, (_, i) =>
        Array.from({ length: 10 }, (_, j) => `R${i}C${j}`),
      );

      const { lastFrame } = await renderWithProviders(
        <TableRenderer headers={headers} rows={rows} terminalWidth={100} />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Col0');
      expect(text).toContain('Col9');
      await expect(lastFrame()).toMatchSvgSnapshot();
    });

    it('should handle table with very long cell content', async () => {
      const longContent = 'word '.repeat(100);

      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Header']}
          rows={[[longContent]]}
          terminalWidth={50}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('word');
    });

    it('should handle table with mixed cell sizes', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['Small', 'MediumColumn', 'VeryLongColumnHeader']}
          rows={[
            ['A', 'Medium', 'Long long content here'],
            ['XYZ', 'B', 'C'],
            ['123456789', 'Something else', 'More text content here'],
          ]}
          terminalWidth={80}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Small');
      expect(text).toContain('Medium');
      expect(text).toContain('VeryLongColumnHeader');
    });
  });

  describe('Responsive behavior', () => {
    it('should adapt to different terminal widths', async () => {
      const headers = ['Name', 'Description', 'Status'];
      const rows = [['Item', 'A detailed description', 'Active']];

      const { lastFrame: narrowFrame } = await renderWithProviders(
        <TableRenderer headers={headers} rows={rows} terminalWidth={30} />,
      );

      const narrowText = stripAnsi(narrowFrame());
      expect(narrowText).toContain('Item');
      await expect(narrowFrame()).toMatchSvgSnapshot();

      const { lastFrame: wideFrame } = await renderWithProviders(
        <TableRenderer headers={headers} rows={rows} terminalWidth={120} />,
      );

      const wideText = stripAnsi(wideFrame());
      expect(wideText).toContain('Item');
      await expect(wideFrame()).toMatchSvgSnapshot();
    });
  });

  describe('Content preservation', () => {
    it('should preserve all text content in output', async () => {
      const content = ['Cell1', 'Cell2', 'Cell3', 'Cell4'];
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={[content[0], content[1]]}
          rows={[[content[2], content[3]]]}
          terminalWidth={50}
        />,
      );

      const text = stripAnsi(lastFrame());
      content.forEach((cellContent) => {
        expect(text).toContain(cellContent);
      });
    });

    it('should handle cells with whitespace correctly', async () => {
      const { lastFrame } = await renderWithProviders(
        <TableRenderer
          headers={['  Padded  ', 'Normal']}
          rows={[['  Cell  ', 'Content']]}
          terminalWidth={50}
        />,
      );

      const text = stripAnsi(lastFrame());
      expect(text).toContain('Padded');
      expect(text).toContain('Cell');
    });
  });
});
