/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import type { 
  AccountSuspensionInfo,
} from './UIStateContext.js';
import type { BackgroundTask } from '../hooks/useExecutionLifecycle.js';
import type { 
  HistoryItem, 
  PermissionConfirmationRequest,
  LoopDetectionConfirmationRequest,
  ActiveHook,
} from '../types.js';
import { type IdeInfo } from '@google/gemini-cli-core';
import { type SlashCommand } from '../commands/types.js';

export interface GlobalStateContextValue {
  isThemeDialogOpen: boolean;
  themeError: string | null;
  isAuthenticating: boolean;
  isConfigInitialized: boolean;
  authError: string | null;
  accountSuspensionInfo: AccountSuspensionInfo | null;
  isAuthDialogOpen: boolean;
  isAwaitingApiKeyInput: boolean;
  apiKeyDefaultValue?: string;
  isSettingsDialogOpen: boolean;
  isSessionBrowserOpen: boolean;
  isModelDialogOpen: boolean;
  isAgentConfigDialogOpen: boolean;
  isPermissionsDialogOpen: boolean;
  showErrorDetails: boolean;
  showDebugProfiler: boolean;
  copyModeEnabled: boolean;
  errorCount: number;
  backgroundTaskCount: number;
  isBackgroundTaskVisible: boolean;
  backgroundTasks: Map<number, BackgroundTask>;
  quittingMessages: HistoryItem[] | null;
  backgroundTaskHeight: number;
  activeBackgroundTaskPid: number | null;
  isBackgroundTaskListOpen: boolean;
  dialogsVisible: boolean;
  customDialog: React.ReactNode | null;
  isEditorDialogOpen: boolean;
  editorError: string | null;
  showPrivacyNotice: boolean;
  corgiMode: boolean;
  debugMessage: string;
  shortcutsHelpVisible: boolean;
  isInputActive: boolean;
  inputWidth: number;
  suggestionsWidth: number;
  isResuming: boolean;
  historyRemountKey: number;
  initError: string | null;
  updateInfo: { message: string; isUpdating?: boolean } | null;
  renderMarkdown: boolean;
  showFullTodos: boolean;
  
  // Dialog state from AppContainer
  adminSettingsChanged: boolean;
  showIdeRestartPrompt: boolean;
  ideTrustRestartReason: string;
  newAgents: string[] | null;
  quota: {
    proQuotaRequest: any; 
    validationRequest: any; 
    overageMenuRequest: any; 
    emptyWalletRequest: any; 
    stats: any;
  };
  shouldShowIdePrompt: boolean;
  currentIDE: IdeInfo | null;
  isRestarting: boolean;
  isFolderTrustDialogOpen: boolean;
  folderDiscoveryResults: any;
  isPolicyUpdateDialogOpen: boolean;
  policyUpdateConfirmationRequest: any;
  loopDetectionConfirmationRequest: LoopDetectionConfirmationRequest | null;
  permissionConfirmationRequest: PermissionConfirmationRequest | null;
  commandConfirmationRequest: any;
  authConsentRequest: any;
  confirmUpdateExtensionRequests: any[];
  selectedAgentName: string | null;
  selectedAgentDisplayName: string | null;
  selectedAgentDefinition: any;
  permissionsDialogProps: any;
  currentModel: string;
  slashCommands: SlashCommand[] | undefined;
  sessionStats: any;
  isTrustedFolder: boolean | undefined;
  activeHooks: ActiveHook[];
  showIsExpandableHint: boolean;
  terminalBackgroundColor: string | undefined;
  extensionsUpdateState: any;
  bannerVisible: boolean;
  bannerData: any;
  transientMessage: any;
  nightly: boolean;
  contextFileNames: string[];
  ideContextState: any;
  ctrlCPressedOnce: boolean;
  ctrlDPressedOnce: boolean;
  currentTip: string | undefined;
  buffer: any;
  currentWittyPhrase: string | undefined;
  elapsedTime: number;
  showApprovalModeIndicator: any;
  allowPlanMode: boolean;
  shellModeActive: boolean;
  showEscapePrompt: boolean;
  queueErrorMessage: string | null;
  geminiMdFileCount: number;
}

export const GlobalStateContext = createContext<
  GlobalStateContextValue | undefined
>(undefined);

export const useGlobalState = (): GlobalStateContextValue => {
  const context = useContext(GlobalStateContext);
  if (context === undefined) {
    throw new Error('useGlobalState must be used within a GlobalStateProvider');
  }
  return context;
};
