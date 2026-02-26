/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../test-utils/render.js';
import { ThinkingMessage } from './components/messages/ThinkingMessage.js';
import { ToolGroupMessage } from './components/messages/ToolGroupMessage.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';
import { SHELL_COMMAND_NAME } from './constants.js';

describe('Copy Mode Alignment Regression', () => {
  const terminalWidth = 80;

  describe('ThinkingMessage', () => {
    const thought = {
      subject: 'Thinking summary',
      description: 'Thinking body',
    };

    it('aligns to column 4 in normal mode', async () => {
      const { lastFrame, waitUntilReady } = renderWithProviders(
        <ThinkingMessage thought={thought} />,
        { width: terminalWidth, uiState: { copyModeEnabled: false } },
      );
      await waitUntilReady();
      const frame = lastFrame();
      // summary: 1 (marginLeft) + 1 (paddingLeft) + 1 (inner paddingLeft) = 3 spaces.
      expect(frame).toContain('   Thinking summary');

      const lines = frame.split('\n');
      // body: starts with "  │ " (2 spaces + border + 1 space).
      expect(lines.some((l) => /^ {2}│ Thinking body/.test(l))).toBe(true);
      expect(frame).toMatchSnapshot();
    });

    it('aligns to column 4 in copy mode', async () => {
      const { lastFrame, waitUntilReady } = renderWithProviders(
        <ThinkingMessage thought={thought} />,
        { width: terminalWidth, uiState: { copyModeEnabled: true } },
      );
      await waitUntilReady();
      const frame = lastFrame();
      const lines = frame.split('\n');
      // summary: remains at 3 spaces.
      expect(lines.some((l) => l.startsWith('   Thinking summary'))).toBe(true);
      // body: 1 (marginLeft) + 1 (paddingLeft) + 1 (border comp) + 1 (paddingLeft) = 4 spaces.
      expect(lines.some((l) => l.startsWith('    Thinking body'))).toBe(true);
      expect(frame).toMatchSnapshot();
    });
  });

  describe('ToolGroupMessage (Shell Tool)', () => {
    const toolCalls = [
      {
        callId: 'tool-1',
        name: SHELL_COMMAND_NAME,
        status: CoreToolCallStatus.Executing,
        resultDisplay: 'ls -la output',
        description: 'Running ls -la',
      },
    ];

    it('aligns header and content to column 4 in copy mode', async () => {
      const { lastFrame, waitUntilReady } = renderWithProviders(
        <ToolGroupMessage
          item={{ type: 'tool_group', id: '1', tools: [], timestamp: 0 }}
          toolCalls={toolCalls}
          terminalWidth={terminalWidth}
        />,
        { width: terminalWidth, uiState: { copyModeEnabled: true } },
      );
      await waitUntilReady();
      const frame = lastFrame();
      const lines = frame.split('\n');

      // Header and content should both have 3 spaces of indentation to start at column 4.
      expect(lines.some((l) => l.startsWith('   Shell Command'))).toBe(true);
      expect(lines.some((l) => l.startsWith('   ls -la output'))).toBe(true);

      expect(frame).toMatchSnapshot();
    });
  });
});
