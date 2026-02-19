/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { DialogManager } from './DialogManager.js';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'ink';
import { type UIState } from '../contexts/UIStateContext.js';
import { type RestartReason } from '../hooks/useIdeTrustListener.js';
import { type IdeInfo } from '@google/gemini-cli-core';

// Mock child components
vi.mock('../IdeIntegrationNudge.js', () => ({
  IdeIntegrationNudge: () => <Text>IdeIntegrationNudge</Text>,
}));
vi.mock('./LoopDetectionConfirmation.js', () => ({
  LoopDetectionConfirmation: () => <Text>LoopDetectionConfirmation</Text>,
}));
vi.mock('./FolderTrustDialog.js', () => ({
  FolderTrustDialog: () => <Text>FolderTrustDialog</Text>,
}));
vi.mock('./ConsentPrompt.js', () => ({
  ConsentPrompt: () => <Text>ConsentPrompt</Text>,
}));
vi.mock('./ThemeDialog.js', () => ({
  ThemeDialog: () => <Text>ThemeDialog</Text>,
}));
vi.mock('./SettingsDialog.js', () => ({
  SettingsDialog: () => <Text>SettingsDialog</Text>,
}));
vi.mock('../auth/AuthInProgress.js', () => ({
  AuthInProgress: () => <Text>AuthInProgress</Text>,
}));
vi.mock('../auth/AuthDialog.js', () => ({
  AuthDialog: () => <Text>AuthDialog</Text>,
}));
vi.mock('../auth/ApiAuthDialog.js', () => ({
  ApiAuthDialog: () => <Text>ApiAuthDialog</Text>,
}));
vi.mock('./EditorSettingsDialog.js', () => ({
  EditorSettingsDialog: () => <Text>EditorSettingsDialog</Text>,
}));
vi.mock('../privacy/PrivacyNotice.js', () => ({
  PrivacyNotice: () => <Text>PrivacyNotice</Text>,
}));
vi.mock('./ProQuotaDialog.js', () => ({
  ProQuotaDialog: () => <Text>ProQuotaDialog</Text>,
}));
vi.mock('./PermissionsModifyTrustDialog.js', () => ({
  PermissionsModifyTrustDialog: () => <Text>PermissionsModifyTrustDialog</Text>,
}));
vi.mock('./ModelDialog.js', () => ({
  ModelDialog: () => <Text>ModelDialog</Text>,
}));
vi.mock('./IdeTrustChangeDialog.js', () => ({
  IdeTrustChangeDialog: () => <Text>IdeTrustChangeDialog</Text>,
}));
vi.mock('./AgentConfigDialog.js', () => ({
  AgentConfigDialog: () => <Text>AgentConfigDialog</Text>,
}));

describe('DialogManager', () => {
  const defaultProps = {
    addItem: vi.fn(),
    terminalWidth: 100,
  };

  const baseUiState = {
    constrainHeight: false,
    terminalHeight: 24,
    staticExtraHeight: 0,
    terminalWidth: 80,
    confirmUpdateExtensionRequests: [],
    showIdeRestartPrompt: false,
    quota: {
      userTier: undefined,
      stats: undefined,
      proQuotaRequest: null,
      validationRequest: null,
    },
    shouldShowIdePrompt: false,
    isFolderTrustDialogOpen: false,
    loopDetectionConfirmationRequest: null,
    confirmationRequest: null,
    consentRequest: null,
    isThemeDialogOpen: false,
    isSettingsDialogOpen: false,
    isModelDialogOpen: false,
    isAuthenticating: false,
    isAwaitingApiKeyInput: false,
    isAuthDialogOpen: false,
    isEditorDialogOpen: false,
    showPrivacyNotice: false,
    isPermissionsDialogOpen: false,
    isAgentConfigDialogOpen: false,
    selectedAgentName: undefined,
    selectedAgentDisplayName: undefined,
    selectedAgentDefinition: undefined,
  };

  it('renders nothing by default', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <DialogManager {...defaultProps} />,
      { uiState: baseUiState as Partial<UIState> as UIState },
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  const testCases: Array<[Partial<UIState>, string]> = [
    [
      {
        showIdeRestartPrompt: true,
        ideTrustRestartReason: 'update' as RestartReason,
      },
      'IdeTrustChangeDialog',
    ],
    [
      {
        quota: {
          userTier: undefined,
          stats: undefined,
          proQuotaRequest: {
            failedModel: 'a',
            fallbackModel: 'b',
            message: 'c',
            isTerminalQuotaError: false,
            resolve: vi.fn(),
          },
          validationRequest: null,
        },
      },
      'ProQuotaDialog',
    ],
    [
      {
        shouldShowIdePrompt: true,
        currentIDE: { name: 'vscode', version: '1.0' } as unknown as IdeInfo,
      },
      'IdeIntegrationNudge',
    ],
    [{ isFolderTrustDialogOpen: true }, 'FolderTrustDialog'],
    [
      { loopDetectionConfirmationRequest: { onComplete: vi.fn() } },
      'LoopDetectionConfirmation',
    ],
    [
      { commandConfirmationRequest: { prompt: 'foo', onConfirm: vi.fn() } },
      'ConsentPrompt',
    ],
    [
      { authConsentRequest: { prompt: 'bar', onConfirm: vi.fn() } },
      'ConsentPrompt',
    ],
    [
      {
        confirmUpdateExtensionRequests: [{ prompt: 'foo', onConfirm: vi.fn() }],
      },
      'ConsentPrompt',
    ],
    [{ isThemeDialogOpen: true }, 'ThemeDialog'],
    [{ isSettingsDialogOpen: true }, 'SettingsDialog'],
    [{ isModelDialogOpen: true }, 'ModelDialog'],
    [{ isAuthenticating: true }, 'AuthInProgress'],
    [{ isAwaitingApiKeyInput: true }, 'ApiAuthDialog'],
    [{ isAuthDialogOpen: true }, 'AuthDialog'],
    [{ isEditorDialogOpen: true }, 'EditorSettingsDialog'],
    [{ showPrivacyNotice: true }, 'PrivacyNotice'],
    [{ isPermissionsDialogOpen: true }, 'PermissionsModifyTrustDialog'],
    [
      {
        isAgentConfigDialogOpen: true,
        selectedAgentName: 'test-agent',
        selectedAgentDisplayName: 'Test Agent',
        selectedAgentDefinition: {
          name: 'test-agent',
          kind: 'local',
          description: 'Test agent',
          inputConfig: { inputSchema: {} },
          promptConfig: { systemPrompt: 'test' },
          modelConfig: { model: 'inherit' },
          runConfig: { maxTimeMinutes: 5 },
        },
      },
      'AgentConfigDialog',
    ],
  ];

  it.each(testCases)(
    'renders %s when state is %o',
    async (uiStateOverride, expectedComponent) => {
      const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
        <DialogManager {...defaultProps} />,
        {
          uiState: {
            ...baseUiState,
            ...uiStateOverride,
          } as Partial<UIState> as UIState,
        },
      );
      await waitUntilReady();
      expect(lastFrame()).toContain(expectedComponent);
      unmount();
    },
  );
});
