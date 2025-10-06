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
import {
  copyExtension,
  installExtension,
  uninstallExtension,
  loadExtension,
  loadInstallMetadata,
  ExtensionStorage,
  loadExtensionConfig,
} from '../extension.js';
import { checkForExtensionUpdate } from './github.js';
import type { GeminiCLIExtension } from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import { getErrorMessage } from '../../utils/errors.js';

export interface ExtensionUpdateInfo {
  name: string;
  originalVersion: string;
  updatedVersion: string;
}

export async function updateExtension(
  extension: GeminiCLIExtension,
  cwd: string = process.cwd(),
  requestConsent: (consent: string) => Promise<boolean>,
  currentState: ExtensionUpdateState,
  dispatchExtensionStateUpdate: (action: ExtensionUpdateAction) => void,
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
    await copyExtension(extension.path, tempDir);
    const previousExtensionConfig = await loadExtensionConfig({
      extensionDir: extension.path,
      workspaceDir: cwd,
    });
    await uninstallExtension(extension.name, cwd);
    await installExtension(
      installMetadata,
      requestConsent,
      cwd,
      previousExtensionConfig,
    );

    const updatedExtensionStorage = new ExtensionStorage(extension.name);
    const updatedExtension = loadExtension({
      extensionDir: updatedExtensionStorage.getExtensionDir(),
      workspaceDir: cwd,
    });
    if (!updatedExtension) {
      dispatchExtensionStateUpdate({
        type: 'SET_STATE',
        payload: { name: extension.name, state: ExtensionUpdateState.ERROR },
      });
      throw new Error('Updated extension not found after installation.');
    }
    const updatedVersion = updatedExtension.config.version;
    dispatchExtensionStateUpdate({
      type: 'SET_STATE',
      payload: {
        name: extension.name,
        state: ExtensionUpdateState.UPDATED_NEEDS_RESTART,
      },
    });
    return {
      name: extension.name,
      originalVersion,
      updatedVersion,
    };
  } catch (e) {
    console.error(
      `Error updating extension, rolling back. ${getErrorMessage(e)}`,
    );
    dispatchExtensionStateUpdate({
      type: 'SET_STATE',
      payload: { name: extension.name, state: ExtensionUpdateState.ERROR },
    });
    await copyExtension(tempDir, extension.path);
    throw e;
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

export async function updateAllUpdatableExtensions(
  cwd: string = process.cwd(),
  requestConsent: (consent: string) => Promise<boolean>,
  extensions: GeminiCLIExtension[],
  extensionsState: Map<string, ExtensionUpdateStatus>,
  dispatch: (action: ExtensionUpdateAction) => void,
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
            cwd,
            requestConsent,
            extensionsState.get(extension.name)!.status,
            dispatch,
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
  dispatch: (action: ExtensionUpdateAction) => void,
  cwd: string = process.cwd(),
): Promise<void> {
  dispatch({ type: 'BATCH_CHECK_START' });
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
      checkForExtensionUpdate(extension, cwd).then((state) =>
        dispatch({
          type: 'SET_STATE',
          payload: { name: extension.name, state },
        }),
      ),
    );
  }
  await Promise.all(promises);
  dispatch({ type: 'BATCH_CHECK_END' });
}
