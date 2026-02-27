/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, cleanup } from '../../../test-utils/render.js';
import { SubagentProgressDisplay } from './SubagentProgressDisplay.js';
import type { SubagentProgress } from '@google/gemini-cli-core';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Text } from 'ink';

vi.mock('ink-spinner', () => ({
  default: () => <Text>⠋</Text>,
}));

describe('<SubagentProgressDisplay />', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders correctly with description in args', async () => {
    const progress: SubagentProgress = {
      isSubagentProgress: true,
      agentName: 'TestAgent',
      recentActivity: [
        {
          type: 'tool_call',
          content: 'run_shell_command',
          args: '{"command": "echo hello", "description": "Say hello"}',
          status: 'running',
        },
      ],
    };

    const { lastFrame, waitUntilReady } = render(
      <SubagentProgressDisplay progress={progress} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with command fallback', async () => {
    const progress: SubagentProgress = {
      isSubagentProgress: true,
      agentName: 'TestAgent',
      recentActivity: [
        {
          type: 'tool_call',
          content: 'run_shell_command',
          args: '{"command": "echo hello"}',
          status: 'running',
        },
      ],
    };

    const { lastFrame, waitUntilReady } = render(
      <SubagentProgressDisplay progress={progress} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with file_path', async () => {
    const progress: SubagentProgress = {
      isSubagentProgress: true,
      agentName: 'TestAgent',
      recentActivity: [
        {
          type: 'tool_call',
          content: 'write_file',
          args: '{"file_path": "/tmp/test.txt", "content": "foo"}',
          status: 'completed',
        },
      ],
    };

    const { lastFrame, waitUntilReady } = render(
      <SubagentProgressDisplay progress={progress} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('truncates long args', async () => {
    const longDesc =
      'This is a very long description that should definitely be truncated because it exceeds the limit of sixty characters.';
    const progress: SubagentProgress = {
      isSubagentProgress: true,
      agentName: 'TestAgent',
      recentActivity: [
        {
          type: 'tool_call',
          content: 'run_shell_command',
          args: JSON.stringify({ description: longDesc }),
          status: 'running',
        },
      ],
    };

    const { lastFrame, waitUntilReady } = render(
      <SubagentProgressDisplay progress={progress} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders thought bubbles correctly', async () => {
    const progress: SubagentProgress = {
      isSubagentProgress: true,
      agentName: 'TestAgent',
      recentActivity: [
        {
          type: 'thought',
          content: 'Thinking about life',
          status: 'running',
        },
      ],
    };

    const { lastFrame, waitUntilReady } = render(
      <SubagentProgressDisplay progress={progress} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders cancelled state correctly', async () => {
    const progress: SubagentProgress = {
      isSubagentProgress: true,
      agentName: 'TestAgent',
      recentActivity: [],
      state: 'cancelled',
    };

    const { lastFrame, waitUntilReady } = render(
      <SubagentProgressDisplay progress={progress} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });
});
