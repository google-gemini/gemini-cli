/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { Card } from './Card.js';
import { Text } from 'ink';
import { describe, it, expect } from 'vitest';
import { ToolCallStatus } from '../../types.js';

describe('Card', () => {
  it.each([
    {
      status: ToolCallStatus.Pending,
      title: 'Gemini CLI update available',
      suffix: '0.26.0 → 0.27.0',
      prefix: true,
      body: 'Installed via Homebrew. Please update with "brew upgrade gemini-cli".',
    },
    {
      status: ToolCallStatus.Canceled,
      title: 'Delegate to agent',
      suffix: "Delegating to agent 'cli_help'",
      prefix: true,
      body: '🤖💭 Execution limit reached (ERROR_NO_COMPLETE_TASK_CALL). Attempting one final recovery turn with a grace period.',
    },
    {
      status: ToolCallStatus.Error,
      title: 'Error',
      suffix: '429 You exceeded your current quota',
      prefix: true,
      body: 'Go to https://aistudio.google.com/apikey to upgrade your quota tier, or submit a quota increase request in https://ai.google.dev/gemini-api/docs/rate-limits',
    },
    {
      status: ToolCallStatus.Confirming,
      title: 'Shell',
      suffix: 'node -v && which gemini',
      prefix: true,
      body: "ls /usr/local/bin | grep 'xattr'",
    },
    {
      status: ToolCallStatus.Success,
      title: 'ReadFolder',
      suffix: '/usr/local/bin',
      prefix: true,
      body: 'Listed 39 item(s).',
    },
  ] as const)(
    'renders a $status card with prefix=$prefix',
    ({ status, title, suffix, prefix, body }) => {
      const { lastFrame } = render(
        <Card status={status} title={title} suffix={suffix} prefix={prefix}>
          <Text>{body}</Text>
        </Card>,
      );

      const output = lastFrame();
      expect(output).toMatchSnapshot();
    },
  );
});
