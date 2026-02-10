/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { Card } from './Card.js';
import { Text } from 'ink';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ToolCallStatus } from '../../types.js';

describe('Card', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    {
      status: ToolCallStatus.Pending,
      title: 'Gemini CLI update available',
      suffix: '0.26.0 → 0.27.0',
      showStatusIndicator: true,
      body: 'Installed via Homebrew. Please update with "brew upgrade gemini-cli".',
    },
    {
      status: ToolCallStatus.Canceled,
      title: 'Delegate to agent',
      suffix: "Delegating to agent 'cli_help'",
      showStatusIndicator: true,
      body: '🤖💭 Execution limit reached (ERROR_NO_COMPLETE_TASK_CALL). Attempting one final recovery turn with a grace period.',
    },
    {
      status: ToolCallStatus.Error,
      title: 'Error',
      suffix: '429 You exceeded your current quota',
      showStatusIndicator: true,
      body: 'Go to https://aistudio.google.com/apikey to upgrade your quota tier, or submit a quota increase request in https://ai.google.dev/gemini-api/docs/rate-limits',
    },
    {
      status: ToolCallStatus.Confirming,
      title: 'Shell',
      suffix: 'node -v && which gemini',
      showStatusIndicator: true,
      body: "ls /usr/local/bin | grep 'xattr'",
    },
    {
      status: ToolCallStatus.Success,
      title: 'ReadFolder',
      suffix: '/usr/local/bin',
      showStatusIndicator: true,
      body: 'Listed 39 item(s).',
    },
    {
      status: ToolCallStatus.Pending,
      title: 'Fixed Width Card',
      suffix: undefined,
      showStatusIndicator: true,
      width: 40,
      body: 'This card has a fixed width of 40 characters.',
    },
  ] as const)(
    "renders '$title' card with status=$status and showStatusIndicator=$showStatusIndicator",
    ({ status, title, suffix, showStatusIndicator, body, width }) => {
      const { lastFrame } = render(
        <Card
          status={status}
          title={title}
          suffix={suffix}
          showStatusIndicator={showStatusIndicator}
          width={width}
        >
          <Text>{body}</Text>
        </Card>,
      );

      const output = lastFrame();
      expect(output).toMatchSnapshot();
    },
  );
});
