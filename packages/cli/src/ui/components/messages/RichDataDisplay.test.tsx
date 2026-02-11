/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { RichDataDisplay } from './RichDataDisplay.js';
import { describe, it, expect } from 'vitest';

describe('RichDataDisplay', () => {
  it('should render table visualization', () => {
    const data = {
      type: 'table' as const,
      data: [{ name: 'Test', value: 123 }],
    };

    const { lastFrame } = renderWithProviders(
      <RichDataDisplay data={data} availableWidth={80} />,
    );
    const output = lastFrame();

    expect(output).toContain('name');
    expect(output).toContain('value');
    expect(output).toContain('Test');
    expect(output).toContain('123');
  });

  it('should render bar chart visualization', () => {
    const data = {
      type: 'bar_chart' as const,
      title: 'Sales',
      data: [
        { label: 'Q1', value: 10 },
        { label: 'Q2', value: 20 },
      ],
    };

    const { lastFrame } = renderWithProviders(
      <RichDataDisplay data={data} availableWidth={80} />,
    );
    const output = lastFrame();

    expect(output).toContain('Sales');
    expect(output).toContain('Q1');
    expect(output).toContain('Q2');
    expect(output).toContain('█'); // Check for bar character
  });

  it('should render line chart visualization', () => {
    const data = {
      type: 'line_chart' as const,
      title: 'Trends',
      data: [
        { label: 'Jan', value: 10 },
        { label: 'Feb', value: 20 },
        { label: 'Mar', value: 15 },
      ],
    };

    const { lastFrame } = renderWithProviders(
      <RichDataDisplay data={data} availableWidth={80} />,
    );
    const output = lastFrame();

    expect(output).toContain('Trends');
    expect(output).toContain('Jan');
    expect(output).toContain('Feb');
    expect(output).toContain('Mar');
    expect(output).toContain('•'); // Check for plot point
    expect(output).toContain('│'); // Check for axis
  });

  it('should render pie chart visualization', () => {
    const data = {
      type: 'pie_chart' as const,
      title: 'Market Share',
      data: [
        { label: 'A', value: 50 },
        { label: 'B', value: 50 },
      ],
    };

    const { lastFrame } = renderWithProviders(
      <RichDataDisplay data={data} availableWidth={80} />,
    );
    const output = lastFrame();

    expect(output).toContain('Market Share');
    expect(output).toContain('A');
    expect(output).toContain('B');
    expect(output).toContain('50.0%');
    expect(output).toContain('█'); // Check for proportional bar
  });

  it('should show saved file path', () => {
    const data = {
      type: 'table' as const,
      data: [],
      savedFilePath: '/path/to/file.csv',
    };

    const { lastFrame } = renderWithProviders(
      <RichDataDisplay data={data} availableWidth={80} />,
    );
    const output = lastFrame();

    expect(output).toContain('Saved to: /path/to/file.csv');
  });

  it('should render diff visualization', () => {
    const data = {
      type: 'diff' as const,
      data: {
        fileDiff:
          'diff --git a/file.txt b/file.txt\nindex 123..456 100644\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-foo\n+bar',
        fileName: 'file.txt',
      },
    };

    const { lastFrame } = renderWithProviders(
      <RichDataDisplay data={data} availableWidth={80} />,
    );
    const output = lastFrame();

    expect(output).toContain('foo');
    expect(output).toContain('bar');
  });
});
