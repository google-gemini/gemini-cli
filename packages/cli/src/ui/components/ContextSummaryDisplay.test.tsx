/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ContextSummaryDisplay } from './ContextSummaryDisplay.js';
import * as useTerminalSize from '../hooks/useTerminalSize.js';

vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: vi.fn(),
}));

const useTerminalSizeMock = vi.mocked(useTerminalSize.useTerminalSize);

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const renderWithWidth = (
  width: number,
  props: React.ComponentProps<typeof ContextSummaryDisplay>,
) => {
  useTerminalSizeMock.mockReturnValue({ columns: width, rows: 24 });
  return render(<ContextSummaryDisplay {...props} />);
};

describe('<ContextSummaryDisplay />', () => {
  const baseProps = {
    geminiMdFileCount: 0,
    contextFileNames: [],
    mcpServers: {},
    ideContext: {
      workspaceState: {
        openFiles: [],
      },
    },
    skillCount: 1,
  };

  it('should render on a single line on a wide screen', () => {
    const props = {
      ...baseProps,
      geminiMdFileCount: 1,
      contextFileNames: ['GEMINI.md'],
      mcpServers: { 'test-server': { command: 'test' } },
      ideContext: {
        workspaceState: {
          openFiles: [{ path: '/a/b/c', timestamp: Date.now() }],
        },
      },
    };
    const { lastFrame, unmount } = renderWithWidth(120, props);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render on multiple lines on a narrow screen', () => {
    const props = {
      ...baseProps,
      geminiMdFileCount: 1,
      contextFileNames: ['GEMINI.md'],
      mcpServers: { 'test-server': { command: 'test' } },
      ideContext: {
        workspaceState: {
          openFiles: [{ path: '/a/b/c', timestamp: Date.now() }],
        },
      },
    };
    const { lastFrame, unmount } = renderWithWidth(60, props);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should switch layout at the 80-column breakpoint', () => {
    const props = {
      ...baseProps,
      geminiMdFileCount: 1,
      contextFileNames: ['GEMINI.md'],
      mcpServers: { 'test-server': { command: 'test' } },
      ideContext: {
        workspaceState: {
          openFiles: [{ path: '/a/b/c', timestamp: Date.now() }],
        },
      },
    };

    // At 80 columns, should be on one line
    const { lastFrame: wideFrame, unmount: unmountWide } = renderWithWidth(
      80,
      props,
    );
    expect(wideFrame()!.includes('\n')).toBe(false);
    unmountWide();

    // At 79 columns, should be on multiple lines
    const { lastFrame: narrowFrame, unmount: unmountNarrow } = renderWithWidth(
      79,
      props,
    );
    expect(narrowFrame()!.includes('\n')).toBe(true);
    expect(narrowFrame()!.split('\n').length).toBe(4);
    unmountNarrow();
  });
  it('should not render empty parts', () => {
    const props = {
      ...baseProps,
      geminiMdFileCount: 0,
      contextFileNames: [],
      mcpServers: {},
      skillCount: 0,
      ideContext: {
        workspaceState: {
          openFiles: [{ path: '/a/b/c', timestamp: Date.now() }],
        },
      },
    };
    const { lastFrame, unmount } = renderWithWidth(60, props);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
