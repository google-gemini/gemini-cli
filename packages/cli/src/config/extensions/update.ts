/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type ExtensionUpdateAction,
  ExtensionUpdateState,
  type ExtensionUpdateStatus,
} from '../../ui/state/extensions.js';
import { loadInstallMetadata } from '../extension.js';
import { checkForExtensionUpdate } from './github.js';
import { debugLogger, type GeminiCLIExtension } from '@google/gemini-cli-core';
import { getErrorMessage } from '../../utils/errors.js';
import { copyExtension, type ExtensionManager } from '../extension-manager.js';
import { ExtensionStorage } from './storage.js';
import { removeDirectoryWithRetry } from '../../utils/retry.js';

export interface ExtensionUpdateInfo {
  name: string;
  originalVersion: string;
  updatedVersion: string;
}

export async function updateExtension(
  extension: GeminiCLIExtension,
  extensionManager: ExtensionManager,
  currentState: ExtensionUpdateState,
  dispatchExtensionStateUpdate: (action: ExtensionUpdateAction) => void,
  enableExtensionReloading?: boolean,
): Promise<ExtensionUpdateInfo | undefined> {
  if (currentState === ExtensionUpdateState.UPDATING) {
    return undefined;
  }
  dispatchExtensionStateUpdate({
    type: 'SET_STATE',
    payload: { name: extension.name, state: ExtensionUpdateState.UPDATING },
  });
  const installMetadata = loadInstallMetadata(extension.path);

  if (!installMetadata?.type) {
    dispatchExtensionStateUpdate({
      type: 'SET_STATE',
      payload: { name: extension.name, state: ExtensionUpdateState.ERROR },
    });
    throw new Error(
      `Extension ${extension.name} cannot be updated, type is unknown.`,
    );
  }
  if (installMetadata?.type === 'link') {
    dispatchExtensionStateUpdate({
      type: 'SET_STATE',
      payload: { name: extension.name, state: ExtensionUpdateState.UP_TO_DATE },
    });
    throw new Error(`Extension is linked so does not need to be updated`);
  }
  const originalVersion = extension.version;

  const tempDir = await ExtensionStorage.createTmpDir();
  try {
    const previousExtensionConfig = await extensionManager.loadExtensionConfig(
      extension.path,
    );
    let updatedExtension: GeminiCLIExtension;
    try {
      updatedExtension = await extensionManager.installOrUpdateExtension(
        installMetadata,
        previousExtensionConfig,
      );
    } catch (e) {
      dispatchExtensionStateUpdate({
        type: 'SET_STATE',
        payload: { name: extension.name, state: ExtensionUpdateState.ERROR },
      });
      throw new Error(
        `Updated extension not found after installation, got error:\n${e}`,
      );
    }
    const updatedVersion = updatedExtension.version;
    dispatchExtensionStateUpdate({
      type: 'SET_STATE',
      payload: {
        name: extension.name,
        state: enableExtensionReloading
          ? ExtensionUpdateState.UPDATED
          : ExtensionUpdateState.UPDATED_NEEDS_RESTART,
      },
    });
    return {
      name: extension.name,
      originalVersion,
      updatedVersion,
    };
  } catch (e) {
    debugLogger.error(
      `Error updating extension, rolling back. ${getErrorMessage(e)}`,
    );
    dispatchExtensionStateUpdate({
      type: 'SET_STATE',
      payload: { name: extension.name, state: ExtensionUpdateState.ERROR },
    });
    await copyExtension(tempDir, extension.path);
    throw e;
  } finally {
    await removeDirectoryWithRetry(tempDir);
  }
}

export async function updateAllUpdatableExtensions(
  extensions: GeminiCLIExtension[],
  extensionsState: Map<string, ExtensionUpdateStatus>,
  extensionManager: ExtensionManager,
  dispatch: (action: ExtensionUpdateAction) => void,
  enableExtensionReloading?: boolean,
): Promise<ExtensionUpdateInfo[]> {
  return (
    await Promise.all(
      extensions
        .filter(
          (extension) =>
            extensionsState.get(extension.name)?.status ===
            ExtensionUpdateState.UPDATE_AVAILABLE,
        )
        .map((extension) =>
          updateExtension(
            extension,
            extensionManager,
            extensionsState.get(extension.name)!.status,
            dispatch,
            enableExtensionReloading,
          ),
        ),
    )
  ).filter((updateInfo) => !!updateInfo);
}

export interface ExtensionUpdateCheckResult {
  state: ExtensionUpdateState;
  error?: string;
}

export async function checkForAllExtensionUpdates(
  extensions: GeminiCLIExtension[],
  extensionManager: ExtensionManager,
  dispatch: (action: ExtensionUpdateAction) => void,
): Promise<void> {
  dispatch({ type: 'BATCH_CHECK_START' });
  try {
    const promises: Array<Promise<void>> = [];
    for (const extension of extensions) {
      if (!extension.installMetadata) {
        dispatch({
          type: 'SET_STATE',
          payload: {
            name: extension.name,
            state: ExtensionUpdateState.NOT_UPDATABLE,
          },
        });
        continue;
      }
      dispatch({
        type: 'SET_STATE',
        payload: {
          name: extension.name,
          state: ExtensionUpdateState.CHECKING_FOR_UPDATES,
        },
      });
      promises.push(
        checkForExtensionUpdate(extension, extensionManager).then((state) =>
          dispatch({
            type: 'SET_STATE',
            payload: { name: extension.name, state },
          }),
        ),
      );
    }
    await Promise.all(promises);
  } finally {
    dispatch({ type: 'BATCH_CHECK_END' });
  }
}
