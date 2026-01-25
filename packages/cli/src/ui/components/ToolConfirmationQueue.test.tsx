/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ToolConfirmationQueue } from './ToolConfirmationQueue.js';
import { ToolCallStatus } from '../types.js';
import { renderWithProviders } from '../../test-utils/render.js';
import type { Config } from '@google/gemini-cli-core';
import type { ConfirmingToolState } from '../hooks/useConfirmingTool.js';

describe('ToolConfirmationQueue', () => {
  const mockConfig = {
    isTrustedFolder: () => true,
    getIdeMode: () => false,
    getModel: () => 'gemini-pro',
    getDebugMode: () => false,
  } as unknown as Config;

  it('renders the confirming tool with progress indicator', () => {
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'ls',
        description: 'list files',
        status: ToolCallStatus.Confirming,
        confirmationDetails: {
          type: 'exec' as const,
          title: 'Confirm execution',
          command: 'ls',
          rootCommand: 'ls',
          rootCommands: ['ls'],
          onConfirm: vi.fn(),
        },
      },
      index: 1,
      total: 3,
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationQueue
        confirmingTool={confirmingTool as unknown as ConfirmingToolState}
      />,
      {
        config: mockConfig,
        uiState: {
          terminalWidth: 80,
        },
      },
    );

    const output = lastFrame();
    expect(output).toContain('Action Required');
    expect(output).toContain('1 of 3');
    expect(output).toContain('ls'); // Tool name
    expect(output).toContain('list files'); // Tool description
    expect(output).toContain("Allow execution of: 'ls'?");
    expect(output).toMatchSnapshot();
  });

  it('returns null if tool has no confirmation details', () => {
    const confirmingTool = {
      tool: {
        callId: 'call-1',
        name: 'ls',
        status: ToolCallStatus.Confirming,
        confirmationDetails: undefined,
      },
      index: 1,
      total: 1,
    };

    const { lastFrame } = renderWithProviders(
      <ToolConfirmationQueue
        confirmingTool={confirmingTool as unknown as ConfirmingToolState}
      />,
      {
        config: mockConfig,
        uiState: {
          terminalWidth: 80,
        },
      },
    );

    expect(lastFrame()).toBe('');
  });
});
