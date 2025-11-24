/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { DialogManager } from './DialogManager.js';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'ink';
import { type UIState } from '../contexts/UIStateContext.js';
import { type RestartReason } from '../hooks/useIdeTrustListener.js';
import { type IdeInfo } from '@google/gemini-cli-core';
import { type ShellConfirmationRequest } from '../types.js';

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
vi.mock('./ShellConfirmationDialog.js', () => ({
  ShellConfirmationDialog: () => <Text>ShellConfirmationDialog</Text>,
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

describe('DialogManager', () => {
  const defaultProps = {
    addItem: vi.fn(),
    terminalWidth: 100,
  };

  const baseUiState = {
    constrainHeight: false,
    terminalHeight: 24,
    staticExtraHeight: 0,
    mainAreaWidth: 80,
    confirmUpdateExtensionRequests: [],
    showIdeRestartPrompt: false,
    proQuotaRequest: null,
    shouldShowIdePrompt: false,
    isFolderTrustDialogOpen: false,
    shellConfirmationRequest: null,
    loopDetectionConfirmationRequest: null,
    confirmationRequest: null,
    isThemeDialogOpen: false,
    isSettingsDialogOpen: false,
    isModelDialogOpen: false,
    isAuthenticating: false,
    isAwaitingApiKeyInput: false,
    isAuthDialogOpen: false,
    isEditorDialogOpen: false,
    showPrivacyNotice: false,
    isPermissionsDialogOpen: false,
  };

  it('renders nothing by default', () => {
    const { lastFrame } = renderWithProviders(
      <DialogManager {...defaultProps} />,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { uiState: baseUiState as any },
    );
    expect(lastFrame()).toBe('');
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
        proQuotaRequest: {
          failedModel: 'a',
          fallbackModel: 'b',
          message: 'c',
          isTerminalQuotaError: false,
          resolve: vi.fn(),
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
      {
        shellConfirmationRequest: {
          commands: [],
          onConfirm: vi.fn(),
        } as unknown as ShellConfirmationRequest,
      },
      'ShellConfirmationDialog',
    ],
    [
      { loopDetectionConfirmationRequest: { onComplete: vi.fn() } },
      'LoopDetectionConfirmation',
    ],
    [
      { confirmationRequest: { prompt: 'foo', onConfirm: vi.fn() } },
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
  ];

  it.each(testCases)(
    'renders %s when state is %o',
    (uiStateOverride, expectedComponent) => {
      const { lastFrame } = renderWithProviders(
        <DialogManager {...defaultProps} />,
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          uiState: { ...baseUiState, ...uiStateOverride } as any,
        },
      );
      expect(lastFrame()).toContain(expectedComponent);
    },
  );
});
