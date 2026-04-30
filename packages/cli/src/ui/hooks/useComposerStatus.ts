/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { useUIState } from '../contexts/UIStateContext.js';
import { useQuotaState } from '../contexts/QuotaContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { CoreToolCallStatus, ApprovalMode } from '@google/gemini-cli-core';
import { type HistoryItemToolGroup, StreamingState } from '../types.js';
import { INTERACTIVE_SHELL_WAITING_PHRASE } from './usePhraseCycler.js';
import { isContextUsageHigh } from '../utils/contextUsage.js';
import { theme } from '../semantic-colors.js';

/**
 * A hook that encapsulates complex status and action-required logic for the Composer.
 */
export const useComposerStatus = () => {
  const uiState = useUIState();
  const quotaState = useQuotaState();
  const settings = useSettings();

  const hasPendingToolConfirmation = useMemo(
    () =>
      (uiState.pendingHistoryItems ?? [])
        .filter(
          (item): item is HistoryItemToolGroup => item.type === 'tool_group',
        )
        .some((item) =>
          item.tools.some(
            (tool) => tool.status === CoreToolCallStatus.AwaitingApproval,
          ),
        ),
    [uiState.pendingHistoryItems],
  );

  const hasPendingActionRequired =
    hasPendingToolConfirmation ||
    Boolean(uiState.commandConfirmationRequest) ||
    Boolean(uiState.authConsentRequest) ||
    (uiState.confirmUpdateExtensionRequests?.length ?? 0) > 0 ||
    Boolean(uiState.loopDetectionConfirmationRequest) ||
    Boolean(quotaState.proQuotaRequest) ||
    Boolean(quotaState.validationRequest) ||
    Boolean(uiState.customDialog);

  const isInteractiveShellWaiting = Boolean(
    uiState.currentLoadingPhrase?.includes(INTERACTIVE_SHELL_WAITING_PHRASE),
  );

  const showLoadingIndicator =
    (!uiState.embeddedShellFocused || uiState.isBackgroundTaskVisible) &&
    uiState.streamingState === StreamingState.Responding &&
    !hasPendingActionRequired;

  const showApprovalModeIndicator = uiState.showApprovalModeIndicator;

  const modeContentObj = useMemo(() => {
    const hideMinimalModeHintWhileBusy =
      !uiState.cleanUiDetailsVisible &&
      (showLoadingIndicator || uiState.activeHooks.length > 0);

    if (hideMinimalModeHintWhileBusy) return null;

    switch (showApprovalModeIndicator) {
      case ApprovalMode.YOLO:
        return { text: 'YOLO', color: theme.status.error };
      case ApprovalMode.PLAN:
        return { text: 'plan', color: theme.status.success };
      case ApprovalMode.AUTO_EDIT:
        return { text: 'auto edit', color: theme.status.warning };
      case ApprovalMode.DEFAULT:
      default:
        return null;
    }
  }, [
    uiState.cleanUiDetailsVisible,
    showLoadingIndicator,
    uiState.activeHooks.length,
    showApprovalModeIndicator,
  ]);

  const showMinimalContext = isContextUsageHigh(
    uiState.sessionStats.lastPromptTokenCount,
    uiState.currentModel,
    settings.merged.model?.compressionThreshold,
  );

  const loadingPhrases = settings.merged.ui.loadingPhrases;
  const showTips = loadingPhrases === 'tips' || loadingPhrases === 'all';
  const showWit = loadingPhrases === 'witty' || loadingPhrases === 'all';

  /**
   * Use the setting if provided, otherwise default to true for the new UX.
   * This allows tests to override the collapse behavior.
   */
  const shouldCollapseDuringApproval =
    settings.merged.ui.collapseDrawerDuringApproval !== false;

  return {
    hasPendingActionRequired,
    shouldCollapseDuringApproval,
    isInteractiveShellWaiting,
    showLoadingIndicator,
    showTips,
    showWit,
    modeContentObj,
    showMinimalContext,
  };
};
