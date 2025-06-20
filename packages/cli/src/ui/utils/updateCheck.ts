/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import updateNotifier from 'update-notifier';
import { readPackageUp } from 'read-package-up';
import process from 'node:process';

export async function checkForUpdates(): Promise<string | null> {
  try {
    // read-package-up looks for the closest package.json from cwd
    const pkgResult = await readPackageUp({ cwd: process.cwd() });
    if (!pkgResult) {
      return null;
    }

    const { packageJson } = pkgResult;
    const notifier = updateNotifier({
      pkg: {
        name: packageJson.name,
        version: packageJson.version,
      },
      // check every time
      updateCheckInterval: 0,
      // allow notifier to run in scripts
      shouldNotifyInNpmScript: true,
    });

    if (notifier.update) {
      return `Gemini CLI update available! ${notifier.update.current} → ${notifier.update.latest}\nRun npm install -g ${packageJson.name} to update`;
    }

    return null;
  } catch (e) {
    console.warn('Failed to check for updates: ' + e);
    return null;
  }
}
