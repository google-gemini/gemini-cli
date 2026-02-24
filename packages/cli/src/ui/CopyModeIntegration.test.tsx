/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { renderWithProviders } from '../test-utils/render.js';
import { UserMessage } from './components/messages/UserMessage.js';
import { GeminiMessage } from './components/messages/GeminiMessage.js';
import { ThinkingMessage } from './components/messages/ThinkingMessage.js';
import { ToolGroupMessage } from './components/messages/ToolGroupMessage.js';
import { AppHeader } from './components/AppHeader.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';

describe('Copy Mode Alignment Regression', () => {
  const terminalWidth = 80;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('UserMessage', () => {
    it('aligns with prefix in normal mode', async () => {
      let renderResult: ReturnType<typeof renderWithProviders> | undefined;
      await act(async () => {
        renderResult = renderWithProviders(
          <UserMessage text="Hello" width={terminalWidth} />,
          { width: terminalWidth, uiState: { copyModeEnabled: false } },
        );
        await renderResult.waitUntilReady();
      });
      const frame = renderResult!.lastFrame();
      // Expect some leading spaces due to HalfLinePaddedBox margin/padding
      expect(frame).toMatchSnapshot();
    });

    it('aligns to column 0 in copy mode', async () => {
      let renderResult: ReturnType<typeof renderWithProviders> | undefined;
      await act(async () => {
        renderResult = renderWithProviders(
          <UserMessage text="Hello" width={terminalWidth} />,
          { width: terminalWidth, uiState: { copyModeEnabled: true } },
        );
        await renderResult.waitUntilReady();
      });
      const frame = renderResult!.lastFrame();
      const lines = frame.split('\n').filter((l) => l.trim().length > 0);
      // In copy mode, UserMessage should start at column 0 with "> " on the second line (after top border)
      expect(lines[1].startsWith('> Hello')).toBe(true);
    });
  });

  describe('GeminiMessage', () => {
    it('aligns with prefix in normal mode', async () => {
      let renderResult: ReturnType<typeof renderWithProviders> | undefined;
      await act(async () => {
        renderResult = renderWithProviders(
          <GeminiMessage
            text="Response"
            isPending={false}
            terminalWidth={terminalWidth}
          />,
          { width: terminalWidth, uiState: { copyModeEnabled: false } },
        );
        await renderResult.waitUntilReady();
      });
      const frame = renderResult!.lastFrame();
      expect(frame).toMatchSnapshot();
    });

    it('aligns with prefix even in copy mode', async () => {
      let renderResult: ReturnType<typeof renderWithProviders> | undefined;
      await act(async () => {
        renderResult = renderWithProviders(
          <GeminiMessage
            text="Response"
            isPending={false}
            terminalWidth={terminalWidth}
          />,
          { width: terminalWidth, uiState: { copyModeEnabled: true } },
        );
        await renderResult.waitUntilReady();
      });
      const frame = renderResult!.lastFrame();
      const lines = frame.split('\n').filter((l) => l.trim().length > 0);
      // In copy mode, prefix "✦ " is preserved as requested
      expect(lines[0].startsWith('✦ Response')).toBe(true);
    });
  });

  describe('ThinkingMessage', () => {
    const thought = {
      subject: 'Thinking summary',
      description: 'Thinking body',
    };

    it('aligns in normal mode', async () => {
      let renderResult: ReturnType<typeof renderWithProviders> | undefined;
      await act(async () => {
        renderResult = renderWithProviders(
          <ThinkingMessage thought={thought} terminalWidth={terminalWidth} />,
          { width: terminalWidth, uiState: { copyModeEnabled: false } },
        );
        await renderResult.waitUntilReady();
      });
      const frame = renderResult!.lastFrame();
      expect(frame).toMatchSnapshot();
    });

    it('aligns to column 0 in copy mode', async () => {
      let renderResult: ReturnType<typeof renderWithProviders> | undefined;
      await act(async () => {
        renderResult = renderWithProviders(
          <ThinkingMessage thought={thought} terminalWidth={terminalWidth} />,
          { width: terminalWidth, uiState: { copyModeEnabled: true } },
        );
        await renderResult.waitUntilReady();
      });
      const frame = renderResult!.lastFrame();
      const lines = frame.split('\n').filter((l) => l.trim().length > 0);
      // In copy mode, all leading indentation should be gone
      expect(lines.some((l) => l.startsWith('Thinking summary'))).toBe(true);
      expect(lines.some((l) => l.startsWith('Thinking body'))).toBe(true);
    });
  });

  describe('ToolGroupMessage', () => {
    const toolCalls = [
      {
        callId: 'tool-1',
        name: 'shell',
        status: CoreToolCallStatus.Success,
        resultDisplay: 'total 0\nfile.txt',
        description: 'ls -la',
        confirmationDetails: undefined,
        renderOutputAsMarkdown: false,
      },
    ];

    it('aligns to column 0 in copy mode', async () => {
      let renderResult: ReturnType<typeof renderWithProviders> | undefined;
      await act(async () => {
        renderResult = renderWithProviders(
          <ToolGroupMessage
            item={{ type: 'tool_group', id: 1, tools: [] }}
            toolCalls={toolCalls}
            terminalWidth={terminalWidth - 1}
            availableTerminalHeight={100}
          />,
          {
            width: terminalWidth,
            uiState: { copyModeEnabled: true },
            useAlternateBuffer: true,
          },
        );
        await renderResult.waitUntilReady();
      });
      const frame = renderResult!.lastFrame();
      const lines = frame.split('\n').filter((l) => l.trim().length > 0);

      // Status line starts at 0
      expect(lines[0].startsWith('✓  shell ls -la')).toBe(true);
      // Output starts at 0
      expect(lines[1].startsWith('total 0')).toBe(true);
      expect(lines[2].startsWith('file.txt')).toBe(true);
    });
  });

  describe('AppHeader', () => {
    it('aligns to column 0 in copy mode', async () => {
      let renderResult: ReturnType<typeof renderWithProviders> | undefined;
      await act(async () => {
        renderResult = renderWithProviders(<AppHeader version="0.0.1" />, {
          width: terminalWidth,
          uiState: {
            copyModeEnabled: true,
            bannerVisible: false,
            updateInfo: null,
          },
        });
        await renderResult.waitUntilReady();
      });
      const frame = renderResult!.lastFrame();
      const lines = frame.split('\n').filter((l) => l.trim().length > 0);
      // First line should start with the icon at col 0
      expect(lines[0].match(/^\S/)).toBeTruthy();
    });
  });
});
