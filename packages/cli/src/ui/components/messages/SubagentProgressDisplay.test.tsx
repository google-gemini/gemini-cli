/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { SubagentProgressDisplay } from './SubagentProgressDisplay.js';
import type { SubagentProgress } from '@google/gemini-cli-core';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'ink';

vi.mock('ink-spinner', () => ({
  default: () => <Text>⠋</Text>,
}));

describe('<SubagentProgressDisplay />', () => {
  it('renders correctly with description in args', () => {
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

    const { lastFrame } = render(
      <SubagentProgressDisplay progress={progress} />,
    );
    const frame = lastFrame();
    expect(frame).toContain('Subagent TestAgent is working...');
    expect(frame).toContain('run_shell_command');
    expect(frame).toContain('Say hello');
    expect(frame).not.toContain('{"command": "echo hello"');
  });

  it('renders correctly with command fallback', () => {
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

    const { lastFrame } = render(
      <SubagentProgressDisplay progress={progress} />,
    );
    const frame = lastFrame();
    expect(frame).toContain('echo hello');
  });

  it('renders correctly with file_path', () => {
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

    const { lastFrame } = render(
      <SubagentProgressDisplay progress={progress} />,
    );
    const frame = lastFrame();
    expect(frame).toContain('/tmp/test.txt');
    expect(frame).not.toContain('"content": "foo"');
  });

  it('truncates long args', () => {
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

    const { lastFrame } = render(
      <SubagentProgressDisplay progress={progress} />,
    );
    const frame = lastFrame();
    expect(frame).toContain('This is a very long description');
    expect(frame).toContain('...');
    // slice(0, 60)
    // "This is a very long description that should definitely be tr"
    expect(frame).not.toContain('sixty characters');
  });

  it('renders thought bubbles correctly', () => {
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

    const { lastFrame } = render(
      <SubagentProgressDisplay progress={progress} />,
    );
    const frame = lastFrame();
    expect(frame).toContain('💭 Thinking about life');
  });

  it('renders cancelled state correctly', () => {
    const progress: SubagentProgress = {
      isSubagentProgress: true,
      agentName: 'TestAgent',
      recentActivity: [],
      state: 'cancelled',
    };

    const { lastFrame } = render(
      <SubagentProgressDisplay progress={progress} />,
    );
    const frame = lastFrame();
    expect(frame).toContain('Subagent TestAgent was cancelled.');
  });
});
