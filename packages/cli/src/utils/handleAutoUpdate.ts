/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { UpdateInfo } from '../ui/utils/updateCheck.js';
import { LoadedSettings } from '../config/settings.js';
import { getInstallationInfo } from './installationInfo.js';
import { updateEventEmitter } from './updateEventEmitter.js';

export function handleAutoUpdate(
  info: UpdateInfo | null,
  settings: LoadedSettings,
  projectRoot: string,
) {
  if (!info) {
    return;
  }

  const installationInfo = getInstallationInfo(
    projectRoot,
    settings.merged.disableAutoUpdate ?? false,
  );

  let combinedMessage = info.message;
  if (installationInfo.updateMessage) {
    combinedMessage += `\n${installationInfo.updateMessage}`;
  }

  updateEventEmitter.emit('update-received', {
    message: combinedMessage,
  });

  if (!installationInfo.updateCommand || settings.merged.disableAutoUpdate) {
    return;
  }

  const updateCommand = installationInfo.updateCommand.replace(
    '@latest',
    `@${info.update.latest}`,
  );

  const updateProcess = spawn(updateCommand, { stdio: 'pipe', shell: true });
  let errorOutput = '';
  updateProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  updateProcess.on('close', (code) => {
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
    updateEventEmitter.emit('update-failed', {
      message: `Automatic update failed. Please try updating manually. (error: ${err.message})`,
    });
  });
  return updateProcess;
}
