/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import {
  StreamingState,
  type ConfirmationRequest,
  type HistoryItem,
  type HistoryItemWithoutId,
  type PermissionConfirmationRequest,
} from '../types.js';
import { getConfirmingToolState } from '../utils/confirmingTool.js';
import { registerSyncCleanup, removeSyncCleanup } from '../../utils/cleanup.js';
import {
  createProgramStatusWriter,
  getProgramStatusBlockedKind,
  inferTurnOutcome,
  mapAppStateToProgramStatus,
  shouldEmitProgramStatus,
  type ProgramStatusBlockedKind,
  type TurnOutcome,
} from '../../utils/programStatus.js';

export interface UseProgramStatusParams {
  enabled: boolean;
  isInteractive: boolean;
  stdoutIsTTY: boolean;
  outputFormat?: string;
  acpMode: boolean;
  streamingState: StreamingState;
  initError: string | null;
  history: HistoryItem[];
  pendingHistoryItems: HistoryItemWithoutId[];
  isAuthDialogOpen: boolean;
  isAuthenticating: boolean;
  isAwaitingApiKeyInput: boolean;
  isAwaitingLoginRestart: boolean;
  authConsentRequest: ConfirmationRequest | null;
  commandConfirmationRequest: ConfirmationRequest | null;
  permissionConfirmationRequest: PermissionConfirmationRequest | null;
  hasConfirmUpdateExtensionRequests: boolean;
  hasLoopDetectionConfirmationRequest: boolean;
  isFolderTrustDialogOpen: boolean;
}

export function resolveProgramStatusBlockedKind({
  streamingState,
  pendingHistoryItems,
  isAuthDialogOpen,
  isAuthenticating,
  isAwaitingApiKeyInput,
  isAwaitingLoginRestart,
  authConsentRequest,
  commandConfirmationRequest,
  permissionConfirmationRequest,
  hasConfirmUpdateExtensionRequests,
  hasLoopDetectionConfirmationRequest,
  isFolderTrustDialogOpen,
}: Pick<
  UseProgramStatusParams,
  | 'streamingState'
  | 'pendingHistoryItems'
  | 'isAuthDialogOpen'
  | 'isAuthenticating'
  | 'isAwaitingApiKeyInput'
  | 'isAwaitingLoginRestart'
  | 'authConsentRequest'
  | 'commandConfirmationRequest'
  | 'permissionConfirmationRequest'
  | 'hasConfirmUpdateExtensionRequests'
  | 'hasLoopDetectionConfirmationRequest'
  | 'isFolderTrustDialogOpen'
>): ProgramStatusBlockedKind | undefined {
  const confirming = getConfirmingToolState(pendingHistoryItems);
  const isAskUser = confirming?.tool?.confirmationDetails?.type === 'ask_user';

  return getProgramStatusBlockedKind({
    authRequired:
      isAuthDialogOpen ||
      isAuthenticating ||
      isAwaitingApiKeyInput ||
      isAwaitingLoginRestart ||
      !!authConsentRequest,
    questionRequired: isAskUser || hasLoopDetectionConfirmationRequest,
    permissionRequired:
      streamingState === StreamingState.WaitingForConfirmation ||
      !!confirming ||
      !!commandConfirmationRequest ||
      !!permissionConfirmationRequest ||
      hasConfirmUpdateExtensionRequests ||
      isFolderTrustDialogOpen,
  });
}

export function useProgramStatus({
  enabled,
  isInteractive,
  stdoutIsTTY,
  outputFormat,
  acpMode,
  streamingState,
  initError,
  history,
  pendingHistoryItems,
  isAuthDialogOpen,
  isAuthenticating,
  isAwaitingApiKeyInput,
  isAwaitingLoginRestart,
  authConsentRequest,
  commandConfirmationRequest,
  permissionConfirmationRequest,
  hasConfirmUpdateExtensionRequests,
  hasLoopDetectionConfirmationRequest,
  isFolderTrustDialogOpen,
}: UseProgramStatusParams): void {
  const active = shouldEmitProgramStatus({
    enabled,
    isInteractive,
    stdoutIsTTY,
    outputFormat,
    acpMode,
  });

  const writerRef = useRef(createProgramStatusWriter());
  const previousStreamingRef = useRef<StreamingState | null>(null);
  const lastTurnOutcomeRef = useRef<TurnOutcome | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const writer = writerRef.current;
    const onExit = () => {
      if (activeRef.current) {
        writer.close();
      }
    };
    registerSyncCleanup(onExit);
    return () => {
      removeSyncCleanup(onExit);
    };
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }

    const writer = writerRef.current;
    return () => {
      writer.close();
    };
  }, [active]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const previousStreamingState = previousStreamingRef.current;
    if (
      streamingState === StreamingState.Idle &&
      (previousStreamingState === StreamingState.Responding ||
        previousStreamingState === StreamingState.WaitingForConfirmation)
    ) {
      lastTurnOutcomeRef.current = inferTurnOutcome(history, initError);
    }
    previousStreamingRef.current = streamingState;

    const blockedKind = resolveProgramStatusBlockedKind({
      streamingState,
      pendingHistoryItems,
      isAuthDialogOpen,
      isAuthenticating,
      isAwaitingApiKeyInput,
      isAwaitingLoginRestart,
      authConsentRequest,
      commandConfirmationRequest,
      permissionConfirmationRequest,
      hasConfirmUpdateExtensionRequests,
      hasLoopDetectionConfirmationRequest,
      isFolderTrustDialogOpen,
    });

    writerRef.current.report(
      mapAppStateToProgramStatus({
        streamingState,
        blockedKind,
        lastTurnOutcome: lastTurnOutcomeRef.current,
        initError,
      }),
    );
  }, [
    active,
    streamingState,
    initError,
    history,
    pendingHistoryItems,
    isAuthDialogOpen,
    isAuthenticating,
    isAwaitingApiKeyInput,
    isAwaitingLoginRestart,
    authConsentRequest,
    commandConfirmationRequest,
    permissionConfirmationRequest,
    hasConfirmUpdateExtensionRequests,
    hasLoopDetectionConfirmationRequest,
    isFolderTrustDialogOpen,
  ]);
}
