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

  describe('with selected lines', () => {
    it('should display selected lines', () => {
      const props = {
        ...baseProps,
        ideContext: {
          workspaceState: {
            openFiles: [
              {
                path: '/a/b/c',
                isActive: true,
                selectedText: 'line1\nline2',
              },
            ],
          },
        },
      };
      const { lastFrame } = renderWithWidth(120, props);
      const output = lastFrame().replace(/\n/g, ' ');
      const parts = output.replace('Using: ', '').split(' | ');
      expect(parts).toEqual([
        '1 open file (ctrl+g to view)',
        '1 GEMINI.md file',
        '1 MCP server (ctrl+t to view)',
        '2 lines selected in c',
      ]);
    });

    it('should truncate a long file name', () => {
      const props = {
        ...baseProps,
        ideContext: {
          workspaceState: {
            openFiles: [
              {
                path: '/a/b/a-very-long-file-name-that-should-be-truncated.ts',
                isActive: true,
                selectedText: 'line1\nline2',
              },
            ],
          },
        },
      };
      const { lastFrame } = renderWithWidth(120, props);
      const output = lastFrame().replace(/\n/g, ' ');
      const parts = output.replace('Using: ', '').split(' | ');
      expect(parts).toEqual([
        '1 open file (ctrl+g to view)',
        '1 GEMINI.md file',
        '1 MCP server (ctrl+t to view)',
        '2 lines selected in a-very-long-f***e-truncated.ts',
      ]);
    });

    it('should not display anything if no lines are selected', () => {
      const props = {
        ...baseProps,
        ideContext: {
          workspaceState: {
            openFiles: [
              {
                path: '/a/b/c',
                isActive: true,
                selectedText: '',
              },
            ],
          },
        },
      };
      const { lastFrame } = renderWithWidth(120, props);
      expect(lastFrame()).not.toContain('selected in');
    });

    it('should count lines containing only whitespace', () => {
      const props = {
        ...baseProps,
        ideContext: {
          workspaceState: {
            openFiles: [
              {
                path: '/a/b/c',
                isActive: true,
                selectedText: 'line1\n  \nline3',
              },
            ],
          },
        },
      };
      const { lastFrame } = renderWithWidth(120, props);
      const output = lastFrame().replace(/\n/g, ' ');
      const parts = output.replace('Using: ', '').split(' | ');
      expect(parts).toEqual([
        '1 open file (ctrl+g to view)',
        '1 GEMINI.md file',
        '1 MCP server (ctrl+t to view)',
        '3 lines selected in c',
      ]);
    });
  });

  it('should render an empty string when there is no context', () => {
    const props = {
      geminiMdFileCount: 0,
      contextFileNames: [],
      mcpServers: {},
      showToolDescriptions: false,
      ideContext: {
        workspaceState: {
          openFiles: [],
        },
      },
    };
    const { lastFrame } = renderWithWidth(120, props);
    expect(lastFrame()).toBe('');
  });
});
