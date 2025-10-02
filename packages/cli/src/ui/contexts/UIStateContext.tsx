/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import type {
  HistoryItem,
  ThoughtSummary,
  ConsoleMessageItem,
  ShellConfirmationRequest,
  ConfirmationRequest,
  LoopDetectionConfirmationRequest,
  HistoryItemWithoutId,
  StreamingState,
} from '../types.js';
import type { CommandContext, SlashCommand } from '../commands/types.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import type {
  IdeContext,
  ApprovalMode,
  UserTierId,
  IdeInfo,
  FallbackIntent,
} from '@google/gemini-cli-core';
import type { DOMElement } from 'ink';
import type { SessionStatsState } from '../contexts/SessionContext.js';
import type { ExtensionUpdateState } from '../state/extensions.js';
import type { UpdateObject } from '../utils/updateCheck.js';

export interface ProQuotaDialogRequest {
  failedModel: string;
  fallbackModel: string;
  resolve: (intent: FallbackIntent) => void;
}

import { type UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';
import { type RestartReason } from '../hooks/useIdeTrustListener.js';

export interface UIState {
  history: HistoryItem[];
  historyManager: UseHistoryManagerReturn;
  isThemeDialogOpen: boolean;
  themeError: string | null;
  isAuthenticating: boolean;
  isConfigInitialized: boolean;
  authError: string | null;
  isAuthDialogOpen: boolean;
  editorError: string | null;
  isEditorDialogOpen: boolean;
  showPrivacyNotice: boolean;
  corgiMode: boolean;
  debugMessage: string;
  quittingMessages: HistoryItem[] | null;
  isSettingsDialogOpen: boolean;
  isModelDialogOpen: boolean;
  isPermissionsDialogOpen: boolean;
  slashCommands: readonly SlashCommand[];
  pendingSlashCommandHistoryItems: HistoryItemWithoutId[];
  commandContext: CommandContext;
  shellConfirmationRequest: ShellConfirmationRequest | null;
  confirmationRequest: ConfirmationRequest | null;
  confirmUpdateExtensionRequests: ConfirmationRequest[];
  loopDetectionConfirmationRequest: LoopDetectionConfirmationRequest | null;
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
  shouldShowIdePrompt: boolean;
  isFolderTrustDialogOpen: boolean;
  isTrustedFolder: boolean | undefined;
  constrainHeight: boolean;
  showErrorDetails: boolean;
  filteredConsoleMessages: ConsoleMessageItem[];
  ideContextState: IdeContext | undefined;
  showToolDescriptions: boolean;
  ctrlCPressedOnce: boolean;
  ctrlDPressedOnce: boolean;
  showEscapePrompt: boolean;
  elapsedTime: number;
  currentLoadingPhrase: string;
  historyRemountKey: number;
  messageQueue: string[];
  showAutoAcceptIndicator: ApprovalMode;
  showWorkspaceMigrationDialog: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workspaceExtensions: any[]; // Extension[]
  // Quota-related state
  userTier: UserTierId | undefined;
  proQuotaRequest: ProQuotaDialogRequest | null;
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
  currentIDE: IdeInfo | null;
  updateInfo: UpdateObject | null;
  showIdeRestartPrompt: boolean;
  ideTrustRestartReason: RestartReason;
  isRestarting: boolean;
  extensionsUpdateState: Map<string, ExtensionUpdateState>;
  activePtyId: number | undefined;
  embeddedShellFocused: boolean;
}

export const UIStateContext = createContext<UIState | null>(null);

export const useUIState = () => {
  const context = useContext(UIStateContext);
  if (!context) {
    throw new Error('useUIState must be used within a UIStateProvider');
  }
  return context;
};
