/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeminiCLIExtension } from '@google/gemini-cli-core';
import { getErrorMessage } from '../../utils/errors.js';
import { ExtensionUpdateState } from '../state/extensions.js';
<<<<<<< HEAD
import { useMemo, useState } from 'react';
=======
import { useState } from 'react';
>>>>>>> upstream/main
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { MessageType } from '../types.js';
import {
  checkForAllExtensionUpdates,
  updateExtension,
} from '../../config/extensions/update.js';
<<<<<<< HEAD
=======
import { requestConsentInteractive } from '../../config/extension.js';
>>>>>>> upstream/main

export const useExtensionUpdates = (
  extensions: GeminiCLIExtension[],
  addItem: UseHistoryManagerReturn['addItem'],
  cwd: string,
) => {
  const [extensionsUpdateState, setExtensionsUpdateState] = useState(
    new Map<string, ExtensionUpdateState>(),
  );
<<<<<<< HEAD
  useMemo(() => {
    const checkUpdates = async () => {
=======
  const [isChecking, setIsChecking] = useState(false);

  (async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
>>>>>>> upstream/main
      const updateState = await checkForAllExtensionUpdates(
        extensions,
        extensionsUpdateState,
        setExtensionsUpdateState,
      );
<<<<<<< HEAD
=======
      let extensionsWithUpdatesCount = 0;
>>>>>>> upstream/main
      for (const extension of extensions) {
        const prevState = extensionsUpdateState.get(extension.name);
        const currentState = updateState.get(extension.name);
        if (
          prevState === currentState ||
          currentState !== ExtensionUpdateState.UPDATE_AVAILABLE
        ) {
          continue;
        }
        if (extension.installMetadata?.autoUpdate) {
<<<<<<< HEAD
          updateExtension(extension, cwd, currentState, (newState) => {
            setExtensionsUpdateState((prev) => {
              const finalState = new Map(prev);
              finalState.set(extension.name, newState);
              return finalState;
            });
          })
=======
          updateExtension(
            extension,
            cwd,
            (description) => requestConsentInteractive(description, addItem),
            currentState,
            (newState) => {
              setExtensionsUpdateState((prev) => {
                const finalState = new Map(prev);
                finalState.set(extension.name, newState);
                return finalState;
              });
            },
          )
>>>>>>> upstream/main
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
              console.error(
                `Error updating extension "${extension.name}": ${getErrorMessage(error)}.`,
              );
            });
        } else {
<<<<<<< HEAD
          addItem(
            {
              type: MessageType.INFO,
              text: `Extension ${extension.name} has an update available, run "/extensions update ${extension.name}" to install it.`,
            },
            Date.now(),
          );
        }
      }
    };
    checkUpdates();
  }, [
    extensions,
    extensionsUpdateState,
    setExtensionsUpdateState,
    addItem,
    cwd,
  ]);
=======
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
    } finally {
      setIsChecking(false);
    }
  })();

>>>>>>> upstream/main
  return {
    extensionsUpdateState,
    setExtensionsUpdateState,
  };
};
