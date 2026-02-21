/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import type {
  HistoryItem,
  ThoughtSummary,
  ConsoleMessageItem,
  ConfirmationRequest,
  QuotaStats,
  LoopDetectionConfirmationRequest,
  HistoryItemWithoutId,
  StreamingState,
  ActiveHook,
  PermissionConfirmationRequest,
} from '../types.js';
import type { CommandContext, SlashCommand } from '../commands/types.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import type {
  IdeContext,
  ApprovalMode,
  UserTierId,
  IdeInfo,
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
  resolve: (intent: FallbackIntent) => void;
}

export interface ValidationDialogRequest {
  validationLink?: string;
  validationDescription?: string;
  learnMoreUrl?: string;
  resolve: (intent: ValidationIntent) => void;
}

import { type UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';
import { type RestartReason } from '../hooks/useIdeTrustListener.js';
import type { TerminalBackgroundColor } from '../utils/terminalCapabilityManager.js';
import type { BackgroundShell } from '../hooks/shellCommandProcessor.js';

export interface QuotaState {
  userTier: UserTierId | undefined;
  stats: QuotaStats | undefined;
  proQuotaRequest: ProQuotaDialogRequest | null;
  validationRequest: ValidationDialogRequest | null;
}

export interface UIState {
  history: HistoryItem[];
  historyManager: UseHistoryManagerReturn;
  isThemeDialogOpen: boolean;
  shouldShowRetentionWarning: boolean;
  sessionsToDeleteCount: number;
  themeError: string | null;
  isAuthenticating: boolean;
  isConfigInitialized: boolean;
  authError: string | null;
  isAuthDialogOpen: boolean;
  isAwaitingApiKeyInput: boolean;
  apiKeyDefaultValue?: string;
  editorError: string | null;
  isEditorDialogOpen: boolean;
  showPrivacyNotice: boolean;
  corgiMode: boolean;
  debugMessage: string;
  quittingMessages: HistoryItem[] | null;
  isSettingsDialogOpen: boolean;
  isSessionBrowserOpen: boolean;
  isModelDialogOpen: boolean;
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
  shellModeActive: boolean;
  userMessages: string[];
  buffer: TextBuffer;
  inputWidth: number;
  suggestionsWidth: number;
  isInputActive: boolean;
  isResuming: boolean;
  shouldShowIdePrompt: boolean;
  isFolderTrustDialogOpen: boolean;
  folderDiscoveryResults: FolderDiscoveryResults | null;
  isPolicyUpdateDialogOpen: boolean;
  policyUpdateConfirmationRequest: PolicyUpdateConfirmationRequest | undefined;
  isTrustedFolder: boolean | undefined;
  constrainHeight: boolean;
  showErrorDetails: boolean;
  filteredConsoleMessages: ConsoleMessageItem[];
  ideContextState: IdeContext | undefined;
  renderMarkdown: boolean;
  ctrlCPressedOnce: boolean;
  ctrlDPressedOnce: boolean;
  showEscapePrompt: boolean;
  shortcutsHelpVisible: boolean;
  cleanUiDetailsVisible: boolean;
  elapsedTime: number;
  currentLoadingPhrase: string | undefined;
  historyRemountKey: number;
  activeHooks: ActiveHook[];
  messageQueue: string[];
  queueErrorMessage: string | null;
  showApprovalModeIndicator: ApprovalMode;
  allowPlanMode: boolean;
  // Quota-related state
  quota: QuotaState;
  currentModel: string;
  contextFileNames: string[];
  errorCount: number;
  availableTerminalHeight: number | undefined;
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
  mainControlsRef: React.MutableRefObject<DOMElement | null>;
  // NOTE: This is for performance profiling only.
  rootUiRef: React.MutableRefObject<DOMElement | null>;
  currentIDE: IdeInfo | null;
  updateInfo: UpdateObject | null;
  showIdeRestartPrompt: boolean;
  ideTrustRestartReason: RestartReason;
  isRestarting: boolean;
  extensionsUpdateState: Map<string, ExtensionUpdateState>;
  activePtyId: number | undefined;
  backgroundShellCount: number;
  isBackgroundShellVisible: boolean;
  embeddedShellFocused: boolean;
  showDebugProfiler: boolean;
  showFullTodos: boolean;
  copyModeEnabled: boolean;
  bannerData: {
    defaultText: string;
    warningText: string;
  };
  bannerVisible: boolean;
  customDialog: React.ReactNode | null;
  terminalBackgroundColor: TerminalBackgroundColor;
  settingsNonce: number;
  backgroundShells: Map<number, BackgroundShell>;
  activeBackgroundShellPid: number | null;
  backgroundShellHeight: number;
  isBackgroundShellListOpen: boolean;
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
