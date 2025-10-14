/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { ContextSummaryDisplay } from './ContextSummaryDisplay.js';
import {
  createMockIdeContext,
  createMockOpenFile,
} from '../../test-utils/testFactories.js';
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
    ideContext: createMockIdeContext({
      workspaceState: {
        openFiles: [createMockOpenFile({ path: '/a/b/c' })],
      },
    }),
  };

  it('should render on a single line on a wide screen', () => {
    const { lastFrame } = renderWithWidth(120, baseProps);
    const output = lastFrame();
    expect(output).toBeDefined();
    if (output) {
      expect(output).toContain(
        'Using: 1 open file (ctrl+g to view) | 1 GEMINI.md file | 1 MCP server (ctrl+t to view)',
      );
      // Check for absence of newlines
      expect(output.includes('\n')).toBe(false);
    }
  });

  it('should render on multiple lines on a narrow screen', () => {
    const { lastFrame } = renderWithWidth(60, baseProps);
    const output = lastFrame();
    const expectedLines = [
      ' Using:',
      '   - 1 open file (ctrl+g to view)',
      '   - 1 GEMINI.md file',
      '   - 1 MCP server (ctrl+t to view)',
    ];
    expect(output).toBeDefined();
    if (output) {
      const actualLines = output.split('\n');
      expect(actualLines).toEqual(expectedLines);
    }
  });

  it('should switch layout at the 80-column breakpoint', () => {
    // At 80 columns, should be on one line
    const { lastFrame: wideFrame } = renderWithWidth(80, baseProps);
    const wide = wideFrame();
    expect(wide).toBeDefined();
    if (wide) {
      expect(wide.includes('\n')).toBe(false);
    }

    // At 79 columns, should be on multiple lines
    const { lastFrame: narrowFrame } = renderWithWidth(79, baseProps);
    const narrow = narrowFrame();
    expect(narrow).toBeDefined();
    if (narrow) {
      expect(narrow.includes('\n')).toBe(true);
      expect(narrow.split('\n').length).toBe(4);
    }
  });

  it('should not render empty parts', () => {
    const props = {
      ...baseProps,
      geminiMdFileCount: 0,
      contextFileNames: [],
      mcpServers: {},
    };
    const { lastFrame } = renderWithWidth(60, props);
    const expectedLines = [' Using:', '   - 1 open file (ctrl+g to view)'];
    const frame = lastFrame();
    expect(frame).toBeDefined();
    if (frame) {
      const actualLines = frame.split('\n');
      expect(actualLines).toEqual(expectedLines);
    }
  });
});
