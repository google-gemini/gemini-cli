/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { ContextSummaryDisplay } from './ContextSummaryDisplay.js';
import * as useTerminalSize from '../hooks/useTerminalSize.js';

vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: vi.fn(),
}));

const useTerminalSizeMock = vi.mocked(useTerminalSize.useTerminalSize);

const renderWithWidth = (
  width: number,
  props: React.ComponentProps<typeof ContextSummaryDisplay>,
) => {
  useTerminalSizeMock.mockReturnValue({ columns: width, rows: 24 });
  return render(<ContextSummaryDisplay {...props} />);
};

describe('<ContextSummaryDisplay />', () => {
  const baseProps = {
    geminiMdFileCount: 1,
    contextFileNames: ['GEMINI.md'],
    mcpServers: { 'test-server': { command: 'test' } },
    showToolDescriptions: false,
    ideContext: {
      workspaceState: {
        openFiles: [{ path: '/a/b/c' }],
      },
    },
  };

  it('should render on a single line on a wide screen', () => {
    const { lastFrame } = renderWithWidth(120, baseProps);
    const output = lastFrame();
    expect(output).toContain(
      'Using: 1 open file (ctrl+g to view) | 1 GEMINI.md file | 1 MCP server (ctrl+t to view)',
    );
    // Check for absence of newlines
    expect(output.includes('\n')).toBe(false);
  });

  it('should render on multiple lines on a narrow screen', () => {
    const { lastFrame } = renderWithWidth(60, baseProps);
    const output = lastFrame();
    const expectedLines = [
      'Using:',
      '  - 1 open file (ctrl+g to view)',
      '  - 1 GEMINI.md file',
      '  - 1 MCP server (ctrl+t to view)',
    ];
    const actualLines = output.split('\n');
    expect(actualLines).toEqual(expectedLines);
  });

  it('should switch layout at the 80-column breakpoint', () => {
    // At 80 columns, should be on one line
    const { lastFrame: wideFrame } = renderWithWidth(80, baseProps);
    expect(wideFrame().includes('\n')).toBe(false);

    // At 79 columns, should be on multiple lines
    const { lastFrame: narrowFrame } = renderWithWidth(79, baseProps);
    expect(narrowFrame().includes('\n')).toBe(true);
    expect(narrowFrame().split('\n').length).toBe(4);
  });

  it('should not render empty parts', () => {
    const props = {
      ...baseProps,
      geminiMdFileCount: 0,
      mcpServers: {},
    };
    const { lastFrame } = renderWithWidth(60, props);
    const expectedLines = ['Using:', '  - 1 open file (ctrl+g to view)'];
    const actualLines = lastFrame().split('\n');
    expect(actualLines).toEqual(expectedLines);
  });
});
