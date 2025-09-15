/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UpdateObject } from '../ui/utils/updateCheck.js';
import type { LoadedSettings } from '../config/settings.ts';
import { getInstallationInfo } from './installationInfo.js';
import { updateEventEmitter } from './updateEventEmitter.js';
import type { HistoryItem } from '../ui/types.js';
import { MessageType } from '../ui/types.js';
import { spawnWrapper } from './spawnWrapper.js';
import type { spawn } from 'node:child_process';

// Global flag to prevent multiple simultaneous updates
let isUpdateInProgress = false;

export function handleAutoUpdate(
  info: UpdateObject | null,
  settings: LoadedSettings,
  projectRoot: string,
  spawnFn: typeof spawn = spawnWrapper,
) {
  if (!info) {
    return;
  }

  // Prevent multiple simultaneous updates
  if (isUpdateInProgress) {
    updateEventEmitter.emit('update-failed', {
      message: 'Another update is already in progress. Please wait for it to complete.',
    });
    return;
  }

  if (settings.merged.general?.disableUpdateNag ?? false) {
    return;
  }

  // Set the update in progress flag
  isUpdateInProgress = true;

  const installationInfo = getInstallationInfo(
    projectRoot,
    settings.merged.general?.disableAutoUpdate ?? false,
  );

  let combinedMessage = info.message;
  if (installationInfo.updateMessage) {
    combinedMessage += `\n${installationInfo.updateMessage}`;
  }

  updateEventEmitter.emit('update-received', {
    message: combinedMessage,
  });

  if (
    !installationInfo.updateCommand ||
    (settings.merged.general?.disableAutoUpdate ?? false)
  ) {
    isUpdateInProgress = false; // Clear the flag if we're not proceeding with update
    return;
  }
  // Validate version string to prevent command injection
  const latestVersion = info.update.latest;
  if (!latestVersion || typeof latestVersion !== 'string') {
    isUpdateInProgress = false;
    updateEventEmitter.emit('update-failed', {
      message: 'Invalid version information received from update check.',
    });
    return;
  }

  // Sanitize version string - only allow alphanumeric, dots, and hyphens
  const sanitizedVersion = latestVersion.replace(/[^a-zA-Z0-9.-]/g, '');
  if (sanitizedVersion !== latestVersion) {
    isUpdateInProgress = false;
    updateEventEmitter.emit('update-failed', {
      message: 'Version string contains invalid characters.',
    });
    return;
  }

  const isNightly = sanitizedVersion.includes('nightly');

  const updateCommand = installationInfo.updateCommand.replace(
    '@latest',
    isNightly ? '@nightly' : `@${sanitizedVersion}`,
  );
  // Use shell: true only for package managers that require it (npm, yarn, etc.)
  // For security, we could parse the command and use direct execution when possible
  const updateProcess = spawnFn(updateCommand, { stdio: 'pipe', shell: true });
  let errorOutput = '';
  updateProcess.stderr.on('data', (data) => {
    // Limit error output to prevent memory exhaustion from runaway processes
    if (errorOutput.length < 10000) { // 10KB limit
      errorOutput += data.toString();
    } else if (errorOutput.length === 10000) {
      errorOutput += '\n[Error output truncated due to size limit]';
    }
  });

  // Add automatic cleanup after a reasonable timeout to prevent zombie processes
  const cleanupTimeout = setTimeout(() => {
    if (!updateProcess.killed) {
      updateProcess.kill('SIGTERM');
      // Give it 5 seconds to terminate gracefully, then force kill
      setTimeout(() => {
        if (!updateProcess.killed) {
          updateProcess.kill('SIGKILL');
        }
      }, 5000);
    }
  }, 300000); // 5 minutes timeout

  // Store reference to prevent garbage collection
  updateProcess.cleanupTimeout = cleanupTimeout;

  updateProcess.on('close', (code) => {
    clearTimeout(cleanupTimeout);
    isUpdateInProgress = false; // Clear the update in progress flag
    if (code === 0) {
      updateEventEmitter.emit('update-success', {
        message:
          'Update successful! The new version will be used on your next run.',
      });
    } else {
      updateEventEmitter.emit('update-failed', {
        message: `Automatic update failed. Please try updating manually. (command: ${updateCommand}, stderr: ${errorOutput.trim()})`,
      });
    }
  });

  updateProcess.on('error', (err) => {
    clearTimeout(cleanupTimeout);
    isUpdateInProgress = false; // Clear the update in progress flag
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
  // Use a Map to track installation status per update to prevent race conditions
  const installationStatus = new Map<string, boolean>();

  const handleUpdateRecieved = (info: UpdateObject) => {
    // Create a more robust update ID to prevent collisions
    const updateId = `${info.update.name}@${info.update.latest}@${Date.now()}`;
    installationStatus.set(updateId, false);

    setUpdateInfo(info);
    const savedMessage = info.message;
    setTimeout(() => {
      // Check status for this specific update
      if (installationStatus.get(updateId) === false) {
        addItem(
          {
            type: MessageType.INFO,
            text: savedMessage,
          },
          Date.now(),
        );
      }
      setUpdateInfo(null);
      // Clean up after timeout
      installationStatus.delete(updateId);
    }, 60000);
  };

  const handleUpdateFailed = () => {
    // Mark all pending updates as failed to prevent duplicate notifications
    for (const [updateId] of installationStatus) {
      installationStatus.set(updateId, true); // true means "handled"
    }
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
    // Mark all pending updates as successful to prevent duplicate notifications
    for (const [updateId] of installationStatus) {
      installationStatus.set(updateId, true);
    }
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

  updateEventEmitter.on('update-received', handleUpdateRecieved);
  updateEventEmitter.on('update-failed', handleUpdateFailed);
  updateEventEmitter.on('update-success', handleUpdateSuccess);
  updateEventEmitter.on('update-info', handleUpdateInfo);

  return () => {
    updateEventEmitter.off('update-received', handleUpdateRecieved);
    updateEventEmitter.off('update-failed', handleUpdateFailed);
    updateEventEmitter.off('update-success', handleUpdateSuccess);
    updateEventEmitter.off('update-info', handleUpdateInfo);
    // Clear all pending status entries to prevent memory leaks
    installationStatus.clear();
  };
}
