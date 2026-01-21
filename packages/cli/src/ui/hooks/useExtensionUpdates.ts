/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, type GeminiCLIExtension } from '@google/gemini-cli-core';
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
import { type ExtensionUpdateInfo } from '../../config/extension.js';
import { checkExhaustive } from '../../utils/checks.js';
import type { ExtensionManager } from '../../config/extension-manager.js';

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
  }
}

export const useConfirmUpdateRequests = () => {
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
  return {
    addConfirmUpdateExtensionRequest,
    confirmUpdateExtensionRequests,
    dispatchConfirmUpdateExtensionRequests,
  };
};

export const useExtensionUpdates = (
  extensionManager: ExtensionManager,
  addItem: UseHistoryManagerReturn['addItem'],
  enableExtensionReloading: boolean,
) => {
  const [extensionsUpdateState, dispatchExtensionStateUpdate] = useReducer(
    extensionUpdatesReducer,
    initialExtensionUpdatesState,
  );
  const extensions = extensionManager.getExtensions();

  useEffect(() => {
    const extensionsToCheck = extensions.filter((extension) => {
      const currentStatus = extensionsUpdateState.extensionStatuses.get(
        extension.name,
      );
      if (!currentStatus) return true;
      const currentState = currentStatus.status;
      return !currentState || currentState === ExtensionUpdateState.UNKNOWN;
    });
    if (extensionsToCheck.length === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    checkForAllExtensionUpdates(
      extensionsToCheck,
      extensionManager,
      dispatchExtensionStateUpdate,
    );
  }, [
    extensions,
    extensionManager,
    extensionsUpdateState.extensionStatuses,
    dispatchExtensionStateUpdate,
  ]);

  useEffect(() => {
    if (extensionsUpdateState.batchChecksInProgress > 0) {
      return;
    }
    const scheduledUpdate = extensionsUpdateState.scheduledUpdate;
    if (scheduledUpdate) {
      dispatchExtensionStateUpdate({
        type: 'CLEAR_SCHEDULED_UPDATE',
      });
    }

    function shouldDoUpdate(extension: GeminiCLIExtension): boolean {
      if (scheduledUpdate) {
        if (scheduledUpdate.all) {
          return true;
        }
        return scheduledUpdate.names?.includes(extension.name) === true;
      } else {
        return extension.installMetadata?.autoUpdate === true;
      }
    }

    // We only notify if we have unprocessed extensions in the UPDATE_AVAILABLE
    // state.
    const pendingUpdates = [];
    const updatePromises: Array<Promise<ExtensionUpdateInfo | undefined>> = [];
    for (const extension of extensions) {
      const currentState = extensionsUpdateState.extensionStatuses.get(
        extension.name,
      );
      if (
        !currentState ||
        currentState.status !== ExtensionUpdateState.UPDATE_AVAILABLE
      ) {
        continue;
      }
      const shouldUpdate = shouldDoUpdate(extension);
      if (!shouldUpdate) {
        if (!currentState.notified) {
          // Mark as processed immediately to avoid re-triggering.
          dispatchExtensionStateUpdate({
            type: 'SET_NOTIFIED',
            payload: { name: extension.name, notified: true },
          });
          pendingUpdates.push(extension.name);
        }
      } else {
        const updatePromise = updateExtension(
          extension,
          extensionManager,
          currentState.status,
          dispatchExtensionStateUpdate,
          enableExtensionReloading,
        );
        updatePromises.push(updatePromise);
        updatePromise
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
      }
    }
    if (pendingUpdates.length > 0) {
      const s = pendingUpdates.length > 1 ? 's' : '';
      addItem(
        {
          type: MessageType.INFO,
          text: `You have ${pendingUpdates.length} extension${s} with an update available. Run "/extensions update ${pendingUpdates.join(' ')}".`,
        },
        Date.now(),
      );
    }
    if (scheduledUpdate) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      Promise.all(updatePromises).then((results) => {
        const nonNullResults = results.filter((result) => result != null);
        scheduledUpdate.onCompleteCallbacks.forEach((callback) => {
          try {
            callback(nonNullResults);
          } catch (e) {
            debugLogger.warn(getErrorMessage(e));
          }
        });
      });
    }
  }, [
    extensions,
    extensionManager,
    extensionsUpdateState,
    addItem,
    enableExtensionReloading,
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
  };
};
