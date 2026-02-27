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

const renderWithWidth = async (
  width: number,
  props: React.ComponentProps<typeof ContextSummaryDisplay>,
) => {
  useTerminalSizeMock.mockReturnValue({ columns: width, rows: 24 });
  const result = render(<ContextSummaryDisplay {...props} />);
  await result.waitUntilReady();
  return result;
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

  it('should render on a single line on a wide screen', async () => {
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
    const { lastFrame, unmount } = await renderWithWidth(120, props);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render on multiple lines on a narrow screen', async () => {
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
    const { lastFrame, unmount } = await renderWithWidth(60, props);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should switch layout at the 80-column breakpoint', async () => {
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
    const { lastFrame: wideFrame, unmount: unmountWide } =
      await renderWithWidth(80, props);
    expect(wideFrame().trim().includes('\n')).toBe(false);
    unmountWide();

    // At 79 columns, should be on multiple lines
    const { lastFrame: narrowFrame, unmount: unmountNarrow } =
      await renderWithWidth(79, props);
    expect(narrowFrame().trim().includes('\n')).toBe(true);
    expect(narrowFrame().trim().split('\n').length).toBe(4);
    unmountNarrow();
  });
  it('should not render empty parts', async () => {
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
    const { lastFrame, unmount } = await renderWithWidth(60, props);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
