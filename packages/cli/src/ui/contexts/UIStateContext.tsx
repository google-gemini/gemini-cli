/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import type {
  HistoryItem,
  ThoughtSummary,
  ConfirmationRequest,
  LoopDetectionConfirmationRequest,
  HistoryItemWithoutId,
  StreamingState,
  ActiveHook,
  PermissionConfirmationRequest,
} from '../types.js';
import type { CommandContext, SlashCommand } from '../commands/types.js';

import type {
  IdeContext,
  ApprovalMode,
  IdeInfo,
  AuthType,
  FallbackIntent,
  ValidationIntent,
  AgentDefinition,
  FolderDiscoveryResults,
  PolicyUpdateConfirmationRequest,
} from '@google/gemini-cli-core';
import { type TransientMessageType } from '../../utils/events.js';
import type { DOMElement } from 'ink';
import type { SessionStatsState } from '../contexts/SessionContext.js';
import type { ExtensionUpdateState } from '../state/extensions.js';
import type { UpdateObject } from '../utils/updateCheck.js';

export interface ProQuotaDialogRequest {
  failedModel: string;
  fallbackModel: string;
  message: string;
  isTerminalQuotaError: boolean;
  isModelNotFoundError?: boolean;
  authType?: AuthType;
  resolve: (intent: FallbackIntent) => void;
}

export interface ValidationDialogRequest {
  validationLink?: string;
  validationDescription?: string;
  learnMoreUrl?: string;
  resolve: (intent: ValidationIntent) => void;
}

/** Intent for overage menu dialog */
export type OverageMenuIntent =
  | 'use_credits'
  | 'use_fallback'
  | 'manage'
  | 'stop';

export interface OverageMenuDialogRequest {
  failedModel: string;
  fallbackModel?: string;
  resetTime?: string;
  creditBalance: number;
  userEmail?: string;
  resolve: (intent: OverageMenuIntent) => void;
}

/** Intent for empty wallet dialog */
export type EmptyWalletIntent = 'get_credits' | 'use_fallback' | 'stop';

export interface EmptyWalletDialogRequest {
  failedModel: string;
  fallbackModel?: string;
  resetTime?: string;
  userEmail?: string;
  onGetCredits: () => void;
  resolve: (intent: EmptyWalletIntent) => void;
}

import { type UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';
import { type RestartReason } from '../hooks/useIdeTrustListener.js';
import type { TerminalBackgroundColor } from '../utils/terminalCapabilityManager.js';
import type { BackgroundTask } from '../hooks/useExecutionLifecycle.js';

export interface AccountSuspensionInfo {
  message: string;
  appealUrl?: string;
  appealLinkText?: string;
}

export interface UIState {
  history: HistoryItem[];
  historyManager: UseHistoryManagerReturn;
  isThemeDialogOpen: boolean;
  themeError: string | null;
  isAuthenticating: boolean;
  isConfigInitialized: boolean;
  authError: string | null;
  accountSuspensionInfo: AccountSuspensionInfo | null;
  isAuthDialogOpen: boolean;
  isAwaitingApiKeyInput: boolean;
  isAwaitingLoginRestart: boolean;
  loginRestartMessage?: string;
  apiKeyDefaultValue?: string;
  editorError: string | null;
  isEditorDialogOpen: boolean;
  showPrivacyNotice: boolean;
  mouseMode: boolean;
  corgiMode: boolean;
  debugMessage: string;
  quittingMessages: HistoryItem[] | null;
  isSettingsDialogOpen: boolean;
  isSessionBrowserOpen: boolean;
  isModelDialogOpen: boolean;
  isVoiceModelDialogOpen: boolean;
  isAgentConfigDialogOpen: boolean;
  selectedAgentName?: string;
  selectedAgentDisplayName?: string;
  selectedAgentDefinition?: AgentDefinition;
  isPermissionsDialogOpen: boolean;
  permissionsDialogProps: { targetDirectory?: string } | null;
  slashCommands: readonly SlashCommand[] | undefined;
  pendingSlashCommandHistoryItems: HistoryItemWithoutId[];
  commandContext: CommandContext;
  commandConfirmationRequest: ConfirmationRequest | null;
  authConsentRequest: ConfirmationRequest | null;
  confirmUpdateExtensionRequests: ConfirmationRequest[];
  loopDetectionConfirmationRequest: LoopDetectionConfirmationRequest | null;
  permissionConfirmationRequest: PermissionConfirmationRequest | null;
  geminiMdFileCount: number;
  streamingState: StreamingState;
  initError: string | null;
  pendingGeminiHistoryItems: HistoryItemWithoutId[];
  thought: ThoughtSummary | null;
  isInputActive: boolean;
  isVoiceModeEnabled: boolean;
  isResuming: boolean;
  shouldShowIdePrompt: boolean;
  isFolderTrustDialogOpen: boolean;
  folderDiscoveryResults: FolderDiscoveryResults | null;
  isPolicyUpdateDialogOpen: boolean;
  policyUpdateConfirmationRequest: PolicyUpdateConfirmationRequest | undefined;
  isTrustedFolder: boolean | undefined;
  constrainHeight: boolean;
  showErrorDetails: boolean;
  ideContextState: IdeContext | undefined;
  renderMarkdown: boolean;
  ctrlCPressedOnce: boolean;
  ctrlDPressedOnce: boolean;
  shortcutsHelpVisible: boolean;
  cleanUiDetailsVisible: boolean;
  elapsedTime: number;
  currentLoadingPhrase: string | undefined;
  currentTip: string | undefined;
  currentWittyPhrase: string | undefined;
  historyRemountKey: number;
  activeHooks: ActiveHook[];
  messageQueue: string[];
  queueErrorMessage: string | null;
  showApprovalModeIndicator: ApprovalMode;
  allowPlanMode: boolean;
  currentModel: string;
  contextFileNames: string[];
  errorCount: number;
  availableTerminalHeight: number | undefined;
  stableControlsHeight: number;
  mainAreaWidth: number;
  staticAreaMaxItemHeight: number;
  staticExtraHeight: number;
  dialogsVisible: boolean;
  pendingHistoryItems: HistoryItemWithoutId[];
  nightly: boolean;
  branchName: string | undefined;
  sessionStats: SessionStatsState;
  terminalWidth: number;
  terminalHeight: number;
  mainControlsRef: (node: DOMElement | null) => void;
  // NOTE: This is for performance profiling only.
  rootUiRef: React.MutableRefObject<DOMElement | null>;
  currentIDE: IdeInfo | null;
  updateInfo: UpdateObject | null;
  showIdeRestartPrompt: boolean;
  ideTrustRestartReason: RestartReason;
  isRestarting: boolean;
  extensionsUpdateState: Map<string, ExtensionUpdateState>;
  activePtyId: number | undefined;
  backgroundTaskCount: number;
  isBackgroundTaskVisible: boolean;
  embeddedShellFocused: boolean;
  showDebugProfiler: boolean;
  showFullTodos: boolean;
  bannerData: {
    defaultText: string;
    warningText: string;
  };
  bannerVisible: boolean;
  customDialog: React.ReactNode | null;
  terminalBackgroundColor: TerminalBackgroundColor;
  settingsNonce: number;
  backgroundTasks: Map<number, BackgroundTask>;
  activeBackgroundTaskPid: number | null;
  backgroundTaskHeight: number;
  isBackgroundTaskListOpen: boolean;
  adminSettingsChanged: boolean;
  newAgents: AgentDefinition[] | null;
  showIsExpandableHint: boolean;
  hintMode: boolean;
  hintBuffer: string;
  transientMessage: {
    text: string;
    type: TransientMessageType;
  } | null;
}

export const UIStateContext = createContext<UIState | null>(null);

export const useUIState = () => {
  const context = useContext(UIStateContext);
  if (!context) {
    throw new Error('useUIState must be used within a UIStateProvider');
  }
  return context;
};
