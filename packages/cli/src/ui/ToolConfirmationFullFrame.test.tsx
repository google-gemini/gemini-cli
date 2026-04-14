/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, renderWithProviders } from '../test-utils/render.js';
import { createMockSettings } from '../test-utils/settings.js';
import { App } from './App.js';
import {
  CoreToolCallStatus,
  ApprovalMode,
  makeFakeConfig,
  type SerializableConfirmationDetails,
} from '@google/gemini-cli-core';
import { type UIState } from './contexts/UIStateContext.js';
import { act } from 'react';
import { StreamingState } from './types.js';

vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    useIsScreenReaderEnabled: vi.fn(() => false),
  };
});

vi.mock('./components/GeminiSpinner.js', () => ({
  GeminiSpinner: () => null,
}));

vi.mock('./components/CliSpinner.js', () => ({
  CliSpinner: () => null,
}));

// Mock hooks to align with codebase style, even if App uses UIState directly
vi.mock('./hooks/useGeminiStream.js');
vi.mock('./hooks/useHistoryManager.js');
vi.mock('./hooks/useQuotaAndFallback.js');
vi.mock('./hooks/useThemeCommand.js');
vi.mock('./auth/useAuth.js');
vi.mock('./hooks/useEditorSettings.js');
vi.mock('./hooks/useSettingsCommand.js');
vi.mock('./hooks/useModelCommand.js');
vi.mock('./hooks/slashCommandProcessor.js');
vi.mock('./hooks/useConsoleMessages.js');
vi.mock('./hooks/useTerminalSize.js', () => ({
  useTerminalSize: vi.fn(() => ({ columns: 100, rows: 30 })),
}));

describe('Full Terminal Tool Confirmation Snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders tool confirmation box in the frame of the entire terminal', async () => {
    // Generate a large diff to warrant truncation
    let largeDiff =
      '--- a/packages/cli/src/ui/components/InputPrompt.tsx\n+++ b/packages/cli/src/ui/components/InputPrompt.tsx\n@@ -1,100 +1,105 @@\n';
    for (let i = 1; i <= 60; i++) {
      largeDiff += ` const line${i} = true;\n`;
    }
    largeDiff += '- return kittyProtocolSupporte...;\n';
    largeDiff += '+ return kittyProtocolSupporte...;\n';
    largeDiff += '  buffer: TextBuffer;\n';
    largeDiff += '  onSubmit: (value: string) => void;';

    const confirmationDetails: SerializableConfirmationDetails = {
      type: 'edit',
      title: 'Edit packages/.../InputPrompt.tsx',
      fileName: 'InputPrompt.tsx',
      filePath: 'packages/.../InputPrompt.tsx',
      fileDiff: largeDiff,
      originalContent: 'old',
      newContent: 'new',
      isModifying: false,
    };

    const toolCalls = [
      {
        callId: 'call-1-modify-selected',
        name: 'Edit',
        description:
          'packages/.../InputPrompt.tsx:   return kittyProtocolSupporte... =>   return kittyProtocolSupporte...',
        status: CoreToolCallStatus.AwaitingApproval,
        resultDisplay: '',
        confirmationDetails,
      },
    ];

    const mockUIState = {
      history: [
        {
          id: 1,
          type: 'user',
          text: 'Can you edit InputPrompt.tsx for me?',
        },
      ],
      mainAreaWidth: 99,
      availableTerminalHeight: 36,
      streamingState: StreamingState.WaitingForConfirmation,
      constrainHeight: true,
      isConfigInitialized: true,
      cleanUiDetailsVisible: true,
      pendingHistoryItems: [
        {
          id: 2,
          type: 'tool_group',
          tools: toolCalls,
        },
      ],
      showApprovalModeIndicator: ApprovalMode.DEFAULT,
      sessionStats: {
        lastPromptTokenCount: 175400,
        contextPercentage: 3,
      },
      buffer: { text: '' },
      messageQueue: [],
      activeHooks: [],
      contextFileNames: [],
      rootUiRef: { current: null },
    } as unknown as UIState;

    const mockConfig = makeFakeConfig();
    mockConfig.getUseAlternateBuffer = () => true;
    mockConfig.isTrustedFolder = () => true;
    mockConfig.getDisableAlwaysAllow = () => false;
    mockConfig.getIdeMode = () => false;
    mockConfig.getTargetDir = () => '/directory';

    const { waitUntilReady, lastFrame, generateSvg, unmount } =
      await renderWithProviders(<App />, {
        uiState: mockUIState,
        quotaState: {
          userTier: 'PRO',
          stats: {
            remaining: 100,
            limit: 1000,
          },
        },
        config: mockConfig,
        settings: createMockSettings({
          merged: {
            ui: {
              useAlternateBuffer: true,
              theme: 'default',
              showUserIdentity: false,
              showShortcutsHint: false,
              footer: {
                hideContextPercentage: false,
                hideTokens: false,
                hideModel: false,
              },
            },
            security: {
              enablePermanentToolApproval: true,
            },
          },
        }),
      });

    await waitUntilReady();

    // Give it a moment to render
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    await expect({ lastFrame, generateSvg }).toMatchSvgSnapshot();
    unmount();
  });
});
