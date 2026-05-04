/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UpdateObject } from '../ui/utils/updateCheck.js';
import type { LoadedSettings } from '../config/settings.js';
import { getInstallationInfo, PackageManager } from './installationInfo.js';
import { updateEventEmitter } from './updateEventEmitter.js';
import { MessageType, type HistoryItem } from '../ui/types.js';
import { spawnWrapper } from './spawnWrapper.js';
import type { spawn } from 'node:child_process';
import {
  debugLogger,
  getChannelFromVersion,
  RELEASE_CHANNEL_STABILITY,
} from '@google/gemini-cli-core';

let _updateInProgress = false;

/** @internal */
export function _setUpdateStateForTesting(value: boolean) {
  _updateInProgress = value;
}

export function isUpdateInProgress() {
  return _updateInProgress;
}

/**
 * Returns a promise that resolves when the update process completes or times out.
 */
export async function waitForUpdateCompletion(
  timeoutMs = 30000,
): Promise<void> {
  if (!_updateInProgress) {
    return;
  }

  debugLogger.log(
    '\nGemini CLI is waiting for a background update to complete before restarting...',
  );

  return new Promise((resolve) => {
    // Re-check the condition inside the promise executor to avoid a race condition.
    // If the update finished between the initial check and now, resolve immediately.
    if (!_updateInProgress) {
      resolve();
      return;
    }

    const timer = setTimeout(cleanup, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      updateEventEmitter.off('update-success', cleanup);
      updateEventEmitter.off('update-failed', cleanup);
      resolve();
    }

    updateEventEmitter.once('update-success', cleanup);
    updateEventEmitter.once('update-failed', cleanup);
  });
}

export function handleAutoUpdate(
  info: UpdateObject | null,
  settings: LoadedSettings,
  projectRoot: string,
  isSandboxEnabled: boolean,
  spawnFn: typeof spawn = spawnWrapper,
) {
  if (!info) {
    return;
  }

  if (isSandboxEnabled) {
    updateEventEmitter.emit('update-info', {
      message: `${info.message}\nAutomatic update is not available in sandbox mode.`,
    });
    return;
  }

  if (!settings.merged.general.enableAutoUpdateNotification) {
    return;
  }

  const installationInfo = getInstallationInfo(
    projectRoot,
    settings.merged.general.enableAutoUpdate,
  );

  if (
    [
      PackageManager.NPX,
      PackageManager.PNPX,
      PackageManager.BUNX,
      PackageManager.BINARY,
    ].includes(installationInfo.packageManager)
  ) {
    return;
  }

  let combinedMessage = info.message;
  if (installationInfo.updateMessage) {
    combinedMessage += `\n${installationInfo.updateMessage}`;
  }

  if (
    !installationInfo.updateCommand ||
    !settings.merged.general.enableAutoUpdate
  ) {
    updateEventEmitter.emit('update-received', {
      ...info,
      message: combinedMessage,
      isUpdating: false,
    });
    return;
  }
  updateEventEmitter.emit('update-received', {
    ...info,
    message: combinedMessage,
    isUpdating: true,
  });
  if (_updateInProgress) {
    return;
  }

  const currentVersion = info.update.current;
  if (!currentVersion) {
    debugLogger.warn(
      'Update check: current version is missing. Skipping automatic update for safety.',
    );
    return;
  }

  const currentChannel = getChannelFromVersion(currentVersion);
  const targetChannel = getChannelFromVersion(info.update.latest);

  // Defense-in-depth: prevent updates to a less stable channel
  if (
    RELEASE_CHANNEL_STABILITY[targetChannel] <
    RELEASE_CHANNEL_STABILITY[currentChannel]
  ) {
    return;
  }

  const isNightly = info.update.latest.includes('nightly');

  const updateCommand = installationInfo.updateCommand.replace(
    '@latest',
    isNightly ? '@nightly' : `@${info.update.latest}`,
  );
  const updateProcess = spawnFn(updateCommand, {
    stdio: 'ignore',
    shell: true,
    detached: true,
  });

  _updateInProgress = true;

  // Un-reference the child process to allow the parent to exit independently.
  updateProcess.unref();

  updateProcess.on('close', (code) => {
    _updateInProgress = false;
    if (code === 0) {
      updateEventEmitter.emit('update-success', {
        message:
          'Update successful! The new version will be used on your next run.',
      });
    } else {
      updateEventEmitter.emit('update-failed', {
        message: `Automatic update failed. Please try updating manually:\n\n${updateCommand}`,
      });
    }
  });

  updateProcess.on('error', (err) => {
    _updateInProgress = false;
    updateEventEmitter.emit('update-failed', {
      message: `Automatic update failed. Please try updating manually. (error: ${err.message})\n\n${updateCommand}`,
    });
  });
  return updateProcess;
}

export function setUpdateHandler(
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
  setUpdateInfo: (info: UpdateObject | null) => void,
) {
  let successfullyInstalled = false;
  const handleUpdateReceived = (info: UpdateObject) => {
    setUpdateInfo(info);
    const savedMessage = info.message;
    setTimeout(() => {
      if (!successfullyInstalled) {
        addItem(
          {
            type: MessageType.INFO,
            text: savedMessage,
          },
          Date.now(),
        );
      }
      setUpdateInfo(null);
    }, 60000);
  };

  const handleUpdateFailed = (data?: { message: string }) => {
    setUpdateInfo(null);
    addItem(
      {
        type: MessageType.ERROR,
        text:
          data?.message ||
          `Automatic update failed. Please try updating manually`,
      },
      Date.now(),
    );
  };

  const handleUpdateSuccess = () => {
    successfullyInstalled = true;
    setUpdateInfo(null);
    addItem(
      {
        type: MessageType.INFO,
        text: `Update successful! The new version will be used on your next run.`,
      },
      Date.now(),
    );
  };

  const handleUpdateInfo = (data: { message: string }) => {
    addItem(
      {
        type: MessageType.INFO,
        text: data.message,
      },
      Date.now(),
    );
  };

  updateEventEmitter.on('update-received', handleUpdateReceived);
  updateEventEmitter.on('update-failed', handleUpdateFailed);
  updateEventEmitter.on('update-success', handleUpdateSuccess);
  updateEventEmitter.on('update-info', handleUpdateInfo);

  return () => {
    updateEventEmitter.off('update-received', handleUpdateReceived);
    updateEventEmitter.off('update-failed', handleUpdateFailed);
    updateEventEmitter.off('update-success', handleUpdateSuccess);
    updateEventEmitter.off('update-info', handleUpdateInfo);
  };
}
