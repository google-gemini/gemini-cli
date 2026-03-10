/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TaskTreeView } from './TaskTreeView.js';
import type { TaskTreeNode } from '../hooks/useTaskTree.js';
import type { IndividualToolCallDisplay } from '../types.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';
import { render } from '../../test-utils/render.js';

/**
 * Factory helper: creates a TaskTreeNode for component testing.
 */
function makeNode(
  callId: string,
  name: string,
  status: CoreToolCallStatus = CoreToolCallStatus.Success,
  depth: number = 0,
  children: TaskTreeNode[] = [],
  overrides: Partial<IndividualToolCallDisplay> = {},
): TaskTreeNode {
  return {
    tool: {
      callId,
      name,
      description: `${name} description`,
      resultDisplay: undefined,
      status,
      confirmationDetails: undefined,
      ...overrides,
    },
    children,
    depth,
  };
}

describe('<TaskTreeView />', () => {
  it('renders nothing for an empty node list', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <TaskTreeView nodes={[]} terminalWidth={80} />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders a single root node with success icon', async () => {
    const nodes = [makeNode('a', 'read_file', CoreToolCallStatus.Success)];
    const { lastFrame, waitUntilReady, unmount } = render(
      <TaskTreeView nodes={nodes} terminalWidth={80} />,
    );
    await waitUntilReady();
    const frame = lastFrame();

    expect(frame).toContain('✓');
    expect(frame).toContain('read_file');
    expect(frame).toContain('read_file description');
    unmount();
  });

  it('renders executing status with the correct icon', async () => {
    const nodes = [makeNode('a', 'run_shell', CoreToolCallStatus.Executing)];
    const { lastFrame, waitUntilReady, unmount } = render(
      <TaskTreeView nodes={nodes} terminalWidth={80} />,
    );
    await waitUntilReady();
    const frame = lastFrame();

    expect(frame).toContain('⊷');
    expect(frame).toContain('run_shell');
    unmount();
  });

  it('renders error status with the correct icon', async () => {
    const nodes = [makeNode('a', 'bad_tool', CoreToolCallStatus.Error)];
    const { lastFrame, waitUntilReady, unmount } = render(
      <TaskTreeView nodes={nodes} terminalWidth={80} />,
    );
    await waitUntilReady();
    const frame = lastFrame();

    expect(frame).toContain('x');
    expect(frame).toContain('bad_tool');
    unmount();
  });

  it('renders awaiting approval status with the correct icon', async () => {
    const nodes = [
      makeNode('a', 'write_file', CoreToolCallStatus.AwaitingApproval),
    ];
    const { lastFrame, waitUntilReady, unmount } = render(
      <TaskTreeView nodes={nodes} terminalWidth={80} />,
    );
    await waitUntilReady();
    const frame = lastFrame();

    expect(frame).toContain('?');
    expect(frame).toContain('write_file');
    unmount();
  });

  it('renders nested children with tree connector characters', async () => {
    const child1 = makeNode('b', 'search_files', CoreToolCallStatus.Success, 1);
    const child2 = makeNode('c', 'write_file', CoreToolCallStatus.Executing, 1);
    const root = makeNode('a', 'agent_task', CoreToolCallStatus.Executing, 0, [
      child1,
      child2,
    ]);

    const { lastFrame, waitUntilReady, unmount } = render(
      <TaskTreeView nodes={[root]} terminalWidth={80} />,
    );
    await waitUntilReady();
    const frame = lastFrame();

    expect(frame).toContain('agent_task');
    expect(frame).toContain('├─');
    expect(frame).toContain('search_files');
    expect(frame).toContain('└─');
    expect(frame).toContain('write_file');
    unmount();
  });

  it('renders 3-level deep nesting', async () => {
    const leaf = makeNode('c', 'read_file', CoreToolCallStatus.Success, 2);
    const mid = makeNode('b', 'sub_agent', CoreToolCallStatus.Executing, 1, [
      leaf,
    ]);
    const root = makeNode('a', 'agent_task', CoreToolCallStatus.Executing, 0, [
      mid,
    ]);

    const { lastFrame, waitUntilReady, unmount } = render(
      <TaskTreeView nodes={[root]} terminalWidth={80} />,
    );
    await waitUntilReady();
    const frame = lastFrame();

    expect(frame).toContain('agent_task');
    expect(frame).toContain('sub_agent');
    expect(frame).toContain('read_file');
    unmount();
  });

  it('renders progress percentage for tools with progress data', async () => {
    const nodes = [
      makeNode('a', 'run_shell', CoreToolCallStatus.Executing, 0, [], {
        progress: 60,
        progressTotal: 100,
      }),
    ];
    const { lastFrame, waitUntilReady, unmount } = render(
      <TaskTreeView nodes={nodes} terminalWidth={80} />,
    );
    await waitUntilReady();
    const frame = lastFrame();

    expect(frame).toContain('60%');
    expect(frame).toContain('run_shell');
    unmount();
  });

  it('renders raw progress value when progressTotal is not set', async () => {
    const nodes = [
      makeNode('a', 'run_shell', CoreToolCallStatus.Executing, 0, [], {
        progress: 42,
      }),
    ];
    const { lastFrame, waitUntilReady, unmount } = render(
      <TaskTreeView nodes={nodes} terminalWidth={80} />,
    );
    await waitUntilReady();
    const frame = lastFrame();

    expect(frame).toContain('42');
    unmount();
  });

  it('renders multiple root nodes independently', async () => {
    const nodes = [
      makeNode('a', 'read_file', CoreToolCallStatus.Success),
      makeNode('b', 'write_file', CoreToolCallStatus.Executing),
      makeNode('c', 'search_files', CoreToolCallStatus.Error),
    ];
    const { lastFrame, waitUntilReady, unmount } = render(
      <TaskTreeView nodes={nodes} terminalWidth={80} />,
    );
    await waitUntilReady();
    const frame = lastFrame();

    expect(frame).toContain('read_file');
    expect(frame).toContain('write_file');
    expect(frame).toContain('search_files');
    unmount();
  });

  it('renders cancelled status with the correct icon', async () => {
    const nodes = [
      makeNode('a', 'cancelled_tool', CoreToolCallStatus.Cancelled),
    ];
    const { lastFrame, waitUntilReady, unmount } = render(
      <TaskTreeView nodes={nodes} terminalWidth={80} />,
    );
    await waitUntilReady();
    const frame = lastFrame();

    expect(frame).toContain('-');
    expect(frame).toContain('cancelled_tool');
    unmount();
  });

  it('renders progressMessage when present', async () => {
    const nodes = [
      makeNode('a', 'run_shell', CoreToolCallStatus.Executing, 0, [], {
        progress: 50,
        progressTotal: 100,
        progressMessage: 'Installing dependencies',
      }),
    ];
    const { lastFrame, waitUntilReady, unmount } = render(
      <TaskTreeView nodes={nodes} terminalWidth={80} />,
    );
    await waitUntilReady();
    const frame = lastFrame();

    expect(frame).toContain('Installing dependencies');
    expect(frame).toContain('50%');
    unmount();
  });

  it('renders no extra text when description is empty', async () => {
    const nodes = [
      makeNode('a', 'read_file', CoreToolCallStatus.Success, 0, [], {
        description: '',
      }),
    ];
    const { lastFrame, waitUntilReady, unmount } = render(
      <TaskTreeView nodes={nodes} terminalWidth={80} />,
    );
    await waitUntilReady();
    const frame = lastFrame();

    expect(frame).toContain('read_file');
    // Should not contain the default " description" text
    expect(frame).not.toContain('read_file description');
    unmount();
  });
});
