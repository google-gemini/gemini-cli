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
import { debugLogger } from '@google/gemini-cli-core';

let _updateInProgress = false;

/**
 * Builds a PowerShell command that waits for the given process to exit
 * before running the update command. This avoids file-locking errors on
 * Windows where the running CLI executable cannot be overwritten.
 */
export function buildWindowsDeferredUpdateCommand(
  updateCommand: string,
  parentPid: number,
): string {
  // Use PowerShell's -EncodedCommand to pass the script as a Base64 string.
  // This avoids all quoting and special character issues that could arise
  // from embedding the update command directly in a -Command string.
  const psScript =
    `Start-Sleep -Seconds 2; ` +
    `try { Wait-Process -Id ${parentPid} -Timeout 60 -ErrorAction SilentlyContinue } catch {}; ` +
    updateCommand;
  const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');
  return `powershell.exe -NoProfile -WindowStyle Hidden -EncodedCommand ${encodedScript}`;
}

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
  spawnFn: typeof spawn = spawnWrapper,
) {
  if (!info) {
    return;
  }

  if (settings.merged.tools.sandbox || process.env['GEMINI_SANDBOX']) {
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
    [PackageManager.NPX, PackageManager.PNPX, PackageManager.BUNX].includes(
      installationInfo.packageManager,
    )
  ) {
    return;
  }

  let combinedMessage = info.message;
  if (installationInfo.updateMessage) {
    combinedMessage += `\n${installationInfo.updateMessage}`;
  }

  updateEventEmitter.emit('update-received', {
    message: combinedMessage,
  });

  if (
    !installationInfo.updateCommand ||
    !settings.merged.general.enableAutoUpdate
  ) {
    return;
  }

  if (_updateInProgress) {
    return;
  }

  const isNightly = info.update.latest.includes('nightly');

  const updateCommand = installationInfo.updateCommand.replace(
    '@latest',
    isNightly ? '@nightly' : `@${info.update.latest}`,
  );

  if (process.platform === 'win32') {
    // On Windows, the CLI executable is locked while the process is running.
    // Running npm install -g in the background will fail because it cannot
    // overwrite the locked files. Instead, spawn a detached PowerShell
    // process that waits for this process to exit before running the update.
    const deferredCommand = buildWindowsDeferredUpdateCommand(
      updateCommand,
      process.pid,
    );
    const updateProcess = spawnFn(deferredCommand, {
      stdio: 'ignore',
      shell: true,
      detached: true,
      windowsHide: true,
    });
    updateProcess.unref();

    // The actual update happens after exit, so we cannot track its progress.
    // Notify the user that the update will be applied on next launch.
    updateEventEmitter.emit('update-info', {
      message:
        'Update will be applied after you exit the CLI (deferred to avoid Windows file locking).',
    });
    return updateProcess;
  }

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
        message: `Automatic update failed. Please try updating manually. (command: ${updateCommand})`,
      });
    }
  });

  updateProcess.on('error', (err) => {
    _updateInProgress = false;
    updateEventEmitter.emit('update-failed', {
      message: `Automatic update failed. Please try updating manually. (error: ${err.message})`,
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

  const handleUpdateFailed = () => {
    setUpdateInfo(null);
    addItem(
      {
        type: MessageType.ERROR,
        text: `Automatic update failed. Please try updating manually`,
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
