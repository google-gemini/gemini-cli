/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { InteractiveRepoMap } from './InteractiveRepoMap.js';
import type { RepoTreeNode } from '@google/gemini-cli-core';

const mockTree: RepoTreeNode = {
  name: 'root',
  isDirectory: true,
  children: [
    { name: 'file1.txt', isDirectory: false },
    {
      name: 'dir1',
      isDirectory: true,
      children: [{ name: 'file2.txt', isDirectory: false }],
    },
  ],
};

const writeKey = (stdin: { write: (data: string) => void }, key: string) => {
  act(() => {
    stdin.write(key);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InteractiveRepoMap', () => {
  it('renders the tree structure', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <InteractiveRepoMap tree={mockTree} onClose={vi.fn()} />,
      {
        uiState: {
          terminalHeight: 40,
          staticExtraHeight: 10,
        },
      },
    );

    await waitUntilReady();
    const frame = lastFrame();
    expect(frame).toContain('root');
    expect(frame).toContain('file1.txt');
    expect(frame).toContain('dir1');
  });

  it('navigates with arrow keys', async () => {
    const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
      <InteractiveRepoMap tree={mockTree} onClose={vi.fn()} />,
      {
        uiState: {
          terminalHeight: 40,
          staticExtraHeight: 10,
        },
      },
    );

    await waitUntilReady();

    // The first item (root) should be selected
    expect(lastFrame()).toMatch(/>.*root\//);

    // Press Down
    writeKey(stdin, '\x1b[B'); // Down
    await waitUntilReady();
    
    // Focused item should change to file1.txt
    expect(lastFrame()).toMatch(/>.*file1.txt/);
    expect(lastFrame()).not.toMatch(/>.*root\//);
  });

  it('expands and collapses directories', async () => {
    const { stdin, lastFrame, waitUntilReady } = renderWithProviders(
      <InteractiveRepoMap tree={mockTree} onClose={vi.fn()} />,
      {
        uiState: {
          terminalHeight: 40,
          staticExtraHeight: 10,
        },
      },
    );

    await waitUntilReady();

    // dir1 is at index 2 (root, file1.txt, dir1)
    writeKey(stdin, '\x1b[B'); // Down to file1.txt
    writeKey(stdin, '\x1b[B'); // Down to dir1

    await waitUntilReady();
    // dir1 is collapsed by default (except root)
    expect(lastFrame()).not.toContain('file2.txt');
    expect(lastFrame()).toMatch(/>.*dir1\//);

    // Press Right to expand
    writeKey(stdin, '\x1b[C'); // Right
    await waitUntilReady();
    expect(lastFrame()).toContain('file2.txt');

    // Press Left to collapse
    writeKey(stdin, '\x1b[D'); // Left
    await waitUntilReady();
    expect(lastFrame()).not.toContain('file2.txt');
  });

  it('closes on q or Escape', async () => {
    const onCloseQ = vi.fn();
    const { stdin: stdinQ, waitUntilReady: readyQ } = renderWithProviders(
      <InteractiveRepoMap tree={mockTree} onClose={onCloseQ} />,
      {
        uiState: {
          terminalHeight: 40,
          staticExtraHeight: 10,
        },
      },
    );

    await readyQ();
    writeKey(stdinQ, 'q');
    await waitFor(() => {
      expect(onCloseQ).toHaveBeenCalled();
    });

    const onCloseEsc = vi.fn();
    const { stdin: stdinEsc, waitUntilReady: readyEsc } = renderWithProviders(
      <InteractiveRepoMap tree={mockTree} onClose={onCloseEsc} />,
      {
        uiState: {
          terminalHeight: 40,
          staticExtraHeight: 10,
        },
      },
    );

    await readyEsc();
    writeKey(stdinEsc, '\x1b'); // Escape
    await waitFor(() => {
      expect(onCloseEsc).toHaveBeenCalled();
    });
  });
});
