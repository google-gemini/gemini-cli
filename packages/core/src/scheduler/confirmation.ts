/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { on } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type ToolConfirmationResponse,
  type SerializableConfirmationDetails,
} from '../confirmation-bus/types.js';
import {
  ToolConfirmationOutcome,
  type ToolConfirmationPayload,
  type ToolCallConfirmationDetails,
} from '../tools/tools.js';
import {
  type ValidatingToolCall,
  type WaitingToolCall,
  CoreToolCallStatus,
} from './types.js';
import type { Config } from '../config/config.js';
import type { SchedulerStateManager } from './state-manager.js';
import type { ToolModificationHandler } from './tool-modifier.js';
import {
  resolveEditorAsync,
  type EditorType,
  NO_EDITOR_AVAILABLE_ERROR,
} from '../utils/editor.js';
import type { DiffUpdateResult } from '../ide/ide-client.js';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents } from '../utils/events.js';

export interface ConfirmationResult {
  outcome: ToolConfirmationOutcome;
  payload?: ToolConfirmationPayload;
}

/**
 * Result of the full confirmation flow, including any user modifications.
 */
export interface ResolutionResult {
  outcome: ToolConfirmationOutcome;
  lastDetails?: SerializableConfirmationDetails;
}

/**
 * Waits for a confirmation response with the matching correlationId.
 *
 * NOTE: It is the caller's responsibility to manage the lifecycle of this wait
 * via the provided AbortSignal. To prevent memory leaks and "zombie" listeners
 * in the event of a lost connection (e.g. IDE crash), it is strongly recommended
 * to use a signal with a timeout (e.g. AbortSignal.timeout(ms)).
 *
 * @param messageBus The MessageBus to listen on.
 * @param correlationId The correlationId to match.
 * @param signal An AbortSignal to cancel the wait and cleanup listeners.
 */
async function awaitConfirmation(
  messageBus: MessageBus,
  correlationId: string,
  signal: AbortSignal,
): Promise<ConfirmationResult> {
  if (signal.aborted) {
    throw new Error('Operation cancelled');
  }

  try {
    for await (const [msg] of on(
      messageBus,
      MessageBusType.TOOL_CONFIRMATION_RESPONSE,
      { signal },
    )) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const response = msg as ToolConfirmationResponse;
      if (response.correlationId === correlationId) {
        return {
          outcome:
            response.outcome ??
            // TODO: Remove legacy confirmed boolean fallback once migration complete
            (response.confirmed
              ? ToolConfirmationOutcome.ProceedOnce
              : ToolConfirmationOutcome.Cancel),
          payload: response.payload,
        };
      }
    }
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    if (signal.aborted || (error as Error).name === 'AbortError') {
      throw new Error('Operation cancelled');
    }
    throw error;
  }

  // This point should only be reached if the iterator closes without resolving,
  // which generally means the signal was aborted.
  throw new Error('Operation cancelled');
}

/**
 * Manages the interactive confirmation loop, handling user modifications
 * via inline diffs or external editors (Vim).
 */
export async function resolveConfirmation(
  toolCall: ValidatingToolCall,
  signal: AbortSignal,
  deps: {
    config: Config;
    messageBus: MessageBus;
    state: SchedulerStateManager;
    modifier: ToolModificationHandler;
    getPreferredEditor: () => EditorType | undefined;
    schedulerId: string;
    onWaitingForConfirmation?: (waiting: boolean) => void;
  },
): Promise<ResolutionResult> {
  const { state, onWaitingForConfirmation } = deps;
  const callId = toolCall.request.callId;
  let outcome = ToolConfirmationOutcome.ModifyWithEditor;
  let lastDetails: SerializableConfirmationDetails | undefined;

  // Loop exists to allow the user to modify the parameters and see the new
  // diff.
  while (outcome === ToolConfirmationOutcome.ModifyWithEditor) {
    if (signal.aborted) throw new Error('Operation cancelled');

    const currentCall = state.getToolCall(callId);
    if (!currentCall || !('invocation' in currentCall)) {
      throw new Error(`Tool call ${callId} lost during confirmation loop`);
    }
    const currentInvocation = currentCall.invocation;

    const details = await currentInvocation.shouldConfirmExecute(signal);
    if (!details) {
      outcome = ToolConfirmationOutcome.ProceedOnce;
      break;
    }

    await notifyHooks(deps, details);

    const correlationId = randomUUID();
    const serializableDetails = details as SerializableConfirmationDetails;
    lastDetails = serializableDetails;

    const ideConfirmation =
      'ideConfirmation' in details ? details.ideConfirmation : undefined;

    state.updateStatus(callId, CoreToolCallStatus.AwaitingApproval, {
      confirmationDetails: serializableDetails,
      correlationId,
    });

    onWaitingForConfirmation?.(true);
    const response = await waitForConfirmation(
      deps.messageBus,
      correlationId,
      signal,
      ideConfirmation,
    );
    onWaitingForConfirmation?.(false);
    outcome = response.outcome;

    if ('onConfirm' in details && typeof details.onConfirm === 'function') {
      await details.onConfirm(outcome, response.payload);
    }

    if (outcome === ToolConfirmationOutcome.ModifyWithEditor) {
      const modResult = await handleExternalModification(
        deps,
        toolCall,
        signal,
      );
      // Editor is not available - emit error feedback and stay in the loop
      // to return to previous confirmation screen.
      if (modResult.error) {
        coreEvents.emitFeedback('error', modResult.error);
      }
    } else if (response.payload && 'newContent' in response.payload) {
      await handleInlineModification(deps, toolCall, response.payload, signal);
      outcome = ToolConfirmationOutcome.ProceedOnce;
    }
  }

  return { outcome, lastDetails };
}

/**
 * Fires hook notifications.
 */
async function notifyHooks(
  deps: { config: Config; messageBus: MessageBus },
  details: ToolCallConfirmationDetails,
): Promise<void> {
  if (deps.config.getHookSystem()) {
    await deps.config.getHookSystem()?.fireToolNotificationEvent({
      ...details,
      // Pass no-op onConfirm to satisfy type definition; side-effects via
      // callbacks are disallowed.
      onConfirm: async () => {},
    } as ToolCallConfirmationDetails);
  }
}

/**
 * Result of attempting external modification.
 * If error is defined, the modification failed.
 */
interface ExternalModificationResult {
  /** Error message if the modification failed */
  error?: string;
}

/**
 * Handles modification via an external editor (e.g. Vim).
 * Returns a result indicating success or failure with an error message.
 */
async function handleExternalModification(
  deps: {
    state: SchedulerStateManager;
    modifier: ToolModificationHandler;
    getPreferredEditor: () => EditorType | undefined;
  },
  toolCall: ValidatingToolCall,
  signal: AbortSignal,
): Promise<ExternalModificationResult> {
  const { state, modifier, getPreferredEditor } = deps;

  const preferredEditor = getPreferredEditor();
  const editor = await resolveEditorAsync(preferredEditor, signal);

  if (!editor) {
    // No editor available - return failure with error message
    return { error: NO_EDITOR_AVAILABLE_ERROR };
  }

  const result = await modifier.handleModifyWithEditor(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    state.firstActiveCall as WaitingToolCall,
    editor,
    signal,
  );
  if (result) {
    const newInvocation = toolCall.tool.build(result.updatedParams);
    state.updateArgs(
      toolCall.request.callId,
      result.updatedParams,
      newInvocation,
    );
  }
  return {};
}

/**
 * Handles modification via inline payload (e.g. from IDE or TUI).
 */
async function handleInlineModification(
  deps: { state: SchedulerStateManager; modifier: ToolModificationHandler },
  toolCall: ValidatingToolCall,
  payload: ToolConfirmationPayload,
  signal: AbortSignal,
): Promise<void> {
  const { state, modifier } = deps;
  const result = await modifier.applyInlineModify(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    state.firstActiveCall as WaitingToolCall,
    payload,
    signal,
  );
  if (result) {
    const newInvocation = toolCall.tool.build(result.updatedParams);
    state.updateArgs(
      toolCall.request.callId,
      result.updatedParams,
      newInvocation,
    );
  }
}

/**
 * Waits for user confirmation, allowing either the MessageBus (TUI) or IDE to
 * resolve it.
 */
async function waitForConfirmation(
  messageBus: MessageBus,
  correlationId: string,
  signal: AbortSignal,
  ideConfirmation?: Promise<DiffUpdateResult>,
): Promise<ConfirmationResult> {
  // Create a controller to abort the bus listener if the IDE wins (or vice versa)
  const raceController = new AbortController();
  const raceSignal = raceController.signal;

  // Propagate the parent signal's abort to our race controller
  const onParentAbort = () => raceController.abort();
  if (signal.aborted) {
    raceController.abort();
  } else {
    signal.addEventListener('abort', onParentAbort);
  }

  try {
    const busPromise = awaitConfirmation(messageBus, correlationId, raceSignal);

    if (!ideConfirmation) {
      return await busPromise;
    }

    // Wrap IDE promise to match ConfirmationResult signature
    const idePromise = ideConfirmation
      .then(
        (resolution) =>
          ({
            outcome:
              resolution.status === 'accepted'
                ? ToolConfirmationOutcome.ProceedOnce
                : ToolConfirmationOutcome.Cancel,
            payload: resolution.content
              ? { newContent: resolution.content }
              : undefined,
          }) as ConfirmationResult,
      )
      .catch((error) => {
        debugLogger.warn('Error waiting for confirmation via IDE', error);
        // Return a never-resolving promise so the race continues with the bus
        return new Promise<ConfirmationResult>(() => {});
      });

    return await Promise.race([busPromise, idePromise]);
  } finally {
    // Cleanup: remove parent listener and abort the race signal to ensure
    // the losing listener (e.g. bus iterator) is closed.
    signal.removeEventListener('abort', onParentAbort);
    raceController.abort();
  }
}
