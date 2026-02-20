/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import { type Key } from '../hooks/useKeypress.js';
import { type IdeIntegrationNudgeResult } from '../IdeIntegrationNudge.js';
import { type FolderTrustChoice } from '../components/FolderTrustDialog.js';
import {
  type AuthType,
  type EditorType,
  type AgentDefinition,
} from '@google/gemini-cli-core';
import { type LoadableSettingScope } from '../../config/settings.js';
import type { AuthState } from '../types.js';
import { type PermissionsDialogProps } from '../components/PermissionsModifyTrustDialog.js';
import type { SessionInfo } from '../../utils/sessionUtils.js';
import { type NewAgentsChoice } from '../components/NewAgentsNotification.js';

export interface UIActions {
  handleThemeSelect: (
    themeName: string,
    scope: LoadableSettingScope,
  ) => Promise<void>;
  closeThemeDialog: () => void;
  handleThemeHighlight: (themeName: string | undefined) => void;
  handleAuthSelect: (
    authType: AuthType | undefined,
    scope: LoadableSettingScope,
  ) => void;
  setAuthState: (state: AuthState) => void;
  onAuthError: (error: string | null) => void;
  handleEditorSelect: (
    editorType: EditorType | undefined,
    scope: LoadableSettingScope,
  ) => void;
  exitEditorDialog: () => void;
  exitPrivacyNotice: () => void;
  closeSettingsDialog: () => void;
  closeModelDialog: () => void;
  openAgentConfigDialog: (
    name: string,
    displayName: string,
    definition: AgentDefinition,
  ) => void;
  closeAgentConfigDialog: () => void;
  openPermissionsDialog: (props?: PermissionsDialogProps) => void;
  closePermissionsDialog: () => void;
  setShellModeActive: (value: boolean) => void;
  vimHandleInput: (key: Key) => boolean;
  handleIdePromptComplete: (result: IdeIntegrationNudgeResult) => void;
  handleFolderTrustSelect: (choice: FolderTrustChoice) => void;
  setIsPolicyUpdateDialogOpen: (value: boolean) => void;
  setConstrainHeight: (value: boolean) => void;
  onEscapePromptChange: (show: boolean) => void;
  refreshStatic: () => void;
  handleFinalSubmit: (value: string) => Promise<void>;
  handleClearScreen: () => void;
  handleProQuotaChoice: (
    choice: 'retry_later' | 'retry_once' | 'retry_always' | 'upgrade',
  ) => void;
  handleValidationChoice: (choice: 'verify' | 'change_auth' | 'cancel') => void;
  openSessionBrowser: () => void;
  closeSessionBrowser: () => void;
  handleResumeSession: (session: SessionInfo) => Promise<void>;
  handleDeleteSession: (session: SessionInfo) => Promise<void>;
  setQueueErrorMessage: (message: string | null) => void;
  popAllMessages: () => string | undefined;
  handleApiKeySubmit: (apiKey: string) => Promise<void>;
  handleApiKeyCancel: () => void;
  setBannerVisible: (visible: boolean) => void;
  setShortcutsHelpVisible: (visible: boolean) => void;
  setCleanUiDetailsVisible: (visible: boolean) => void;
  toggleCleanUiDetailsVisible: () => void;
  revealCleanUiDetailsTemporarily: (durationMs?: number) => void;
  handleWarning: (message: string) => void;
  setEmbeddedShellFocused: (value: boolean) => void;
  dismissBackgroundShell: (pid: number) => void;
  setActiveBackgroundShellPid: (pid: number) => void;
  setIsBackgroundShellListOpen: (isOpen: boolean) => void;
  setAuthContext: (context: { requiresRestart?: boolean }) => void;
  onHintInput: (char: string) => void;
  onHintBackspace: () => void;
  onHintClear: () => void;
  onHintSubmit: (hint: string) => void;
  handleRestart: () => void;
  handleNewAgentsSelect: (choice: NewAgentsChoice) => Promise<void>;
}

export const UIActionsContext = createContext<UIActions | null>(null);

export const useUIActions = () => {
  const context = useContext(UIActionsContext);
  if (!context) {
    throw new Error('useUIActions must be used within a UIActionsProvider');
  }
  return context;
};
