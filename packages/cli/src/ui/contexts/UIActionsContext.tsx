/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import { Key } from '../hooks/useKeypress.js';
import { IdeIntegrationNudgeResult } from '../IdeIntegrationNudge.js';
import { FolderTrustChoice } from '../components/FolderTrustDialog.js';
import { AuthType, EditorType } from '@google/gemini-cli-core';
import { SettingScope } from '../../config/settings.js';

export interface UIActions {
  handleThemeSelect: (
    themeName: string | undefined,
    scope: SettingScope,
  ) => void;
  handleThemeHighlight: (themeName: string | undefined) => void;
  handleAuthSelect: (
    authType: AuthType | undefined,
    scope: SettingScope,
  ) => void;
  handleEditorSelect: (
    editorType: EditorType | undefined,
    scope: SettingScope,
  ) => void;
  exitEditorDialog: () => void;
  exitPrivacyNotice: () => void;
  closeSettingsDialog: () => void;
  setShellModeActive: (value: boolean) => void;
  vimHandleInput: (key: Key) => boolean;
  handleIdePromptComplete: (result: IdeIntegrationNudgeResult) => void;
  handleFolderTrustSelect: (choice: FolderTrustChoice) => void;
  setConstrainHeight: (value: boolean) => void;
  onEscapePromptChange: (show: boolean) => void;
  refreshStatic: () => void;
  handleFinalSubmit: (value: string) => void;
  handleClearScreen: () => void;
}

export const UIActionsContext = createContext<UIActions | null>(null);

export const useUIActions = () => {
  const context = useContext(UIActionsContext);
  if (!context) {
    throw new Error('useUIActions must be used within a UIActionsProvider');
  }
  return context;
};
