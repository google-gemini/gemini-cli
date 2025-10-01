/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiCLIExtension } from '@google/gemini-cli-core';
import { getErrorMessage } from '../../utils/errors.js';
import {
  ExtensionUpdateState,
  extensionUpdatesReducer,
  initialExtensionUpdatesState,
} from '../state/extensions.js';
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { MessageType, type ConfirmationRequest } from '../types.js';
import {
  checkForAllExtensionUpdates,
  updateExtension,
} from '../../config/extensions/update.js';
import { requestConsentInteractive } from '../../config/extension.js';
import { checkExhaustive } from '../../utils/checks.js';

type ConfirmationRequestWrapper = {
  prompt: React.ReactNode;
  onConfirm: (confirmed: boolean) => void;
};

type ConfirmationRequestAction =
  | { type: 'add'; request: ConfirmationRequestWrapper }
  | { type: 'remove'; request: ConfirmationRequestWrapper };

function confirmationRequestsReducer(
  state: ConfirmationRequestWrapper[],
  action: ConfirmationRequestAction,
): ConfirmationRequestWrapper[] {
  switch (action.type) {
    case 'add':
      return [...state, action.request];
    case 'remove':
      return state.filter((r) => r !== action.request);
    default:
      checkExhaustive(action);
      return state;
  }
}

export const useExtensionUpdates = (
  extensions: GeminiCLIExtension[],
  addItem: UseHistoryManagerReturn['addItem'],
  cwd: string,
) => {
  const [extensionsUpdateState, dispatchExtensionStateUpdate] = useReducer(
    extensionUpdatesReducer,
    initialExtensionUpdatesState,
  );
  const [
    confirmUpdateExtensionRequests,
    dispatchConfirmUpdateExtensionRequests,
  ] = useReducer(confirmationRequestsReducer, []);
  const addConfirmUpdateExtensionRequest = useCallback(
    (original: ConfirmationRequest) => {
      const wrappedRequest = {
        prompt: original.prompt,
        onConfirm: (confirmed: boolean) => {
          // Remove it from the outstanding list of requests by identity.
          dispatchConfirmUpdateExtensionRequests({
            type: 'remove',
            request: wrappedRequest,
          });
          original.onConfirm(confirmed);
        },
      };
      dispatchConfirmUpdateExtensionRequests({
        type: 'add',
        request: wrappedRequest,
      });
    },
    [dispatchConfirmUpdateExtensionRequests],
  );

  useEffect(() => {
    (async () => {
      await checkForAllExtensionUpdates(
        extensions,
        dispatchExtensionStateUpdate,
      );
    })();
  }, [extensions, extensions.length, dispatchExtensionStateUpdate]);

  useEffect(() => {
    if (extensionsUpdateState.batchChecksInProgress > 0) {
      return;
    }

    let extensionsWithUpdatesCount = 0;
    for (const extension of extensions) {
      const currentState = extensionsUpdateState.extensionStatuses.get(
        extension.name,
      );
      if (
        !currentState ||
        currentState.processed ||
        currentState.status !== ExtensionUpdateState.UPDATE_AVAILABLE
      ) {
        continue;
      }

      // Mark as processed immediately to avoid re-triggering.
      dispatchExtensionStateUpdate({
        type: 'SET_PROCESSED',
        payload: { name: extension.name, processed: true },
      });

      if (extension.installMetadata?.autoUpdate) {
        updateExtension(
          extension,
          cwd,
          (description) =>
            requestConsentInteractive(
              description,
              addConfirmUpdateExtensionRequest,
            ),
          currentState.status,
          dispatchExtensionStateUpdate,
        )
          .then((result) => {
            if (!result) return;
            addItem(
              {
                type: MessageType.INFO,
                text: `Extension "${extension.name}" successfully updated: ${result.originalVersion} → ${result.updatedVersion}.`,
              },
              Date.now(),
            );
          })
          .catch((error) => {
            addItem(
              {
                type: MessageType.ERROR,
                text: getErrorMessage(error),
              },
              Date.now(),
            );
          });
      } else {
        extensionsWithUpdatesCount++;
      }
    }
    if (extensionsWithUpdatesCount > 0) {
      const s = extensionsWithUpdatesCount > 1 ? 's' : '';
      addItem(
        {
          type: MessageType.INFO,
          text: `You have ${extensionsWithUpdatesCount} extension${s} with an update available, run "/extensions list" for more information.`,
        },
        Date.now(),
      );
    }
  }, [
    extensions,
    extensionsUpdateState,
    addConfirmUpdateExtensionRequest,
    addItem,
    cwd,
  ]);

  const extensionsUpdateStateComputed = useMemo(() => {
    const result = new Map<string, ExtensionUpdateState>();
    for (const [
      key,
      value,
    ] of extensionsUpdateState.extensionStatuses.entries()) {
      result.set(key, value.status);
    }
    return result;
  }, [extensionsUpdateState]);

  return {
    extensionsUpdateState: extensionsUpdateStateComputed,
    extensionsUpdateStateInternal: extensionsUpdateState.extensionStatuses,
    dispatchExtensionStateUpdate,
    confirmUpdateExtensionRequests,
    addConfirmUpdateExtensionRequest,
  };
};
