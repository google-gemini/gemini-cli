/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../test-utils/render.js';
import { createMockSettings } from '../test-utils/settings.js';
import { App } from './App.js';
import { StreamingState } from './types.js';
import {
  CoreToolCallStatus,
  ApprovalMode,
  makeFakeConfig,
} from '@google/gemini-cli-core';
import { type UIState } from './contexts/UIStateContext.js';
import type { SerializableConfirmationDetails } from '@google/gemini-cli-core';
import { act } from 'react';

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

describe('Full Terminal Tool Confirmation Snapshot', () => {
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
      renderMarkdown: true,
      streamingState: StreamingState.WaitingForConfirmation,
      terminalWidth: 100,
      terminalHeight: 30,
      currentModel: 'gemini-3.1-pro-preview',
      terminalBackgroundColor: 'black' as const,
      cleanUiDetailsVisible: true,
      allowPlanMode: true,
      activePtyId: null,
      backgroundShells: new Map(),
      backgroundShellHeight: 0,
      quota: {
        userTier: 'PRO',
        stats: {
          limits: {},
          usage: {},
        },
        proQuotaRequest: null,
        validationRequest: null,
      },
      hintMode: false,
      hintBuffer: '',
      bannerData: {
        defaultText: '',
        warningText: '',
      },
      bannerVisible: false,
      nightly: false,
      updateInfo: null,
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
      isBackgroundShellListOpen: false,
      messageQueue: [],
      activeHooks: [],
      transientMessage: null,
      contextFileNames: [],
      geminiMdFileCount: 0,
      rootUiRef: { current: null },
      mainControlsRef: { current: null },
      isConfigInitialized: true,
      slashCommands: [],
      isTrustedFolder: true,
      availableTerminalHeight: 26,
      constrainHeight: true,
      mainAreaWidth: 100,
      staticAreaMaxItemHeight: 10,
      historyRemountKey: 0,
      isEditorDialogOpen: false,
      embeddedShellFocused: false,
      dialogsVisible: false,
      historyManager: { addItem: vi.fn() },
      isBackgroundShellVisible: false,
    } as unknown as UIState;

    const mockConfig = makeFakeConfig();
    mockConfig.getUseAlternateBuffer = () => true;
    mockConfig.isTrustedFolder = () => true;
    mockConfig.getDisableAlwaysAllow = () => false;
    mockConfig.getIdeMode = () => false;

    const { waitUntilReady, lastFrame, generateSvg, unmount } =
      await renderWithProviders(<App />, {
        uiState: mockUIState,
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
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    await expect({ lastFrame, generateSvg }).toMatchSvgSnapshot();
    unmount();
  });
});
