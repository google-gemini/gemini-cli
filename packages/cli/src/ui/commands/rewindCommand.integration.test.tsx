/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { rewindCommand } from './rewindCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { waitFor } from '../../test-utils/async.js';
import { renderWithProviders } from '../../test-utils/render.js';
import type { CommandContext, OpenCustomDialogActionReturn } from './types.js';
import { act } from 'react';

// Mock dependencies
const mockRewindTo = vi.fn();
const mockRecordMessage = vi.fn();
const mockSetHistory = vi.fn();
const mockSendMessageStream = vi.fn();
const mockGetChatRecordingService = vi.fn();
const mockGetConversation = vi.fn();
const mockRemoveComponent = vi.fn();
const mockLoadHistory = vi.fn();
const mockAddItem = vi.fn();
const mockSetPendingItem = vi.fn();
const mockResetContext = vi.fn();
const mockGetProjectRoot = vi.fn().mockReturnValue('/mock/root');

// Mock rewindFileOps
const mockRevertFileChanges = vi.fn();
vi.mock('../utils/rewindFileOps.js', () => ({
  revertFileChanges: (...args: unknown[]) => mockRevertFileChanges(...args),
  calculateTurnStats: vi.fn(),
  calculateRewindImpact: vi.fn(),
}));

// Mock useSessionBrowser
vi.mock('../hooks/useSessionBrowser.js', () => ({
  convertSessionToHistoryFormats: vi.fn().mockReturnValue({
    uiHistory: [],
    clientHistory: [],
  }),
}));

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    debugLogger: {
      error: vi.fn(),
      debug: vi.fn(),
      log: vi.fn(),
    },
    coreEvents: {
      emitFeedback: vi.fn(),
    },
  };
});

describe('rewindCommand Integration', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetConversation.mockReturnValue({
      messages: [
        { type: 'user', content: 'Test Message', id: '1', timestamp: '1' },
        { type: 'gemini', content: 'Response', id: '2', timestamp: '2' },
      ],
      sessionId: 'test-session',
    });

    mockRewindTo.mockReturnValue({
      messages: [],
    });

    mockGetChatRecordingService.mockReturnValue({
      getConversation: mockGetConversation,
      rewindTo: mockRewindTo,
      recordMessage: mockRecordMessage,
    });

    mockContext = createMockCommandContext({
      services: {
        config: {
          getGeminiClient: () => ({
            getChatRecordingService: mockGetChatRecordingService,
            setHistory: mockSetHistory,
            sendMessageStream: mockSendMessageStream,
          }),
          getSessionId: () => 'test-session-id',
          getContextManager: () => ({ refresh: mockResetContext }),
          getProjectRoot: mockGetProjectRoot,
        },
      },
      ui: {
        removeComponent: mockRemoveComponent,
        loadHistory: mockLoadHistory,
        addItem: mockAddItem,
        setPendingItem: mockSetPendingItem,
      },
    }) as unknown as CommandContext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders RewindViewer, handles interaction, and shows loading state', async () => {
    // 1. Run the command to get the component
    const result = (await rewindCommand.action!(
      mockContext,
      '',
    )) as OpenCustomDialogActionReturn;
    expect(result).toHaveProperty('type', 'custom_dialog');

    // 2. Render the component with providers
    const { lastFrame, stdin } = renderWithProviders(
      result.component as React.ReactElement,
    );

    // 3. Verify RewindViewer is rendered
    expect(lastFrame()).toContain('> Rewind');
    expect(lastFrame()).toContain('Test Message');

    // 4. Select the message (Enter)
    act(() => {
      stdin.write('\r');
    });

    // 5. Verify Confirmation Dialog
    await waitFor(() => {
      expect(lastFrame()).toContain('Confirm Rewind');
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    // 6. Mock rewindTo to delay so we can see loading state
    mockRewindTo.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));

      return { messages: [] };
    });

    // 7. Confirm Rewind

    // (Enter on default option 'Rewind conversation and revert code changes')

    // We need to ensure RewindAndRevert is selected or select it.

    // Default selection is usually first.

    await act(async () => {
      stdin.write('\r');
    });

    // 8. Verify Loading State

    // We expect "Rewinding..." to be visible

    await waitFor(() => {
      expect(lastFrame()).toContain('Rewinding...');
    });

    // 9. Wait for completion

    await waitFor(() => {
      expect(mockRewindTo).toHaveBeenCalledWith('1');
    });

    // 10. Verify component removal (it's called in onRewind)
    expect(mockRemoveComponent).toHaveBeenCalled();
  });
});
