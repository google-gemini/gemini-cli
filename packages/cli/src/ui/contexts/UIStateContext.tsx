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
  HistoryItemWithoutId,
  StreamingState,
} from '../types.js';
import type { CommandContext, SlashCommand } from '../commands/types.js';
import type { TextBuffer } from '../components/shared/text-buffer.js';
import type {
  IdeContext,
  ApprovalMode,
  UserTierId,
  DetectedIde,
  FallbackIntent,
} from '@google/gemini-cli-core';
import type { DOMElement } from 'ink';
import type { SessionStatsState } from '../contexts/SessionContext.js';
import type { UpdateObject } from '../utils/updateCheck.js';

export interface ProQuotaDialogRequest {
  failedModel: string;
  fallbackModel: string;
  resolve: (intent: FallbackIntent) => void;
}

export interface UIState {
  history: HistoryItem[];
  isThemeDialogOpen: boolean;
  themeError: string | null;
  isAuthenticating: boolean;
  authError: string | null;
  isAuthDialogOpen: boolean;
  editorError: string | null;
  isEditorDialogOpen: boolean;
  showPrivacyNotice: boolean;
  corgiMode: boolean;
  debugMessage: string;
  quittingMessages: HistoryItem[] | null;
  isSettingsDialogOpen: boolean;
  slashCommands: readonly SlashCommand[];
  pendingSlashCommandHistoryItems: HistoryItemWithoutId[];
  commandContext: CommandContext;
  shellConfirmationRequest: ShellConfirmationRequest | null;
  confirmationRequest: ConfirmationRequest | null;
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
  isFocused: boolean;
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
  currentIDE: DetectedIde | null;
  updateInfo: UpdateObject | null;
  showIdeRestartPrompt: boolean;
  isRestarting: boolean;
}

export const UIStateContext = createContext<UIState | null>(null);

export const useUIState = () => {
  const context = useContext(UIStateContext);
  if (!context) {
    throw new Error('useUIState must be used within a UIStateProvider');
  }
  return context;
};
