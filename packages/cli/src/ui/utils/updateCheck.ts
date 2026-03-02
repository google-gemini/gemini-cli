/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import latestVersion from 'latest-version';
import semver from 'semver';
import { getPackageJson, debugLogger } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const FETCH_TIMEOUT_MS = 2000;

// Replicating the bits of UpdateInfo we need from update-notifier
export interface UpdateInfo {
  latest: string;
  current: string;
  name: string;
  type?: semver.ReleaseType;
}

export interface UpdateObject {
  message: string;
  update: UpdateInfo;
}

/**
 * From a nightly and stable version, determines which is the "best" one to offer.
 * The rule is to always prefer nightly if the base versions are the same.
 */
function getBestAvailableUpdate(
  nightly?: string,
  stable?: string,
): string | null {
  if (!nightly) return stable || null;
  if (!stable) return nightly || null;

  if (semver.coerce(stable)?.version === semver.coerce(nightly)?.version) {
    return nightly;
  }

  return semver.gt(stable, nightly) ? stable : nightly;
}

export async function checkForUpdates(
  settings: LoadedSettings,
): Promise<UpdateObject | null> {
  try {
    if (settings.merged.general.disableUpdateNag) {
      return null;
    }
    // Skip update check when running from source (development mode)
    if (process.env['DEV'] === 'true') {
      return null;
    }
    const packageJson = await getPackageJson(__dirname);
    if (!packageJson || !packageJson.name || !packageJson.version) {
      return null;
    }

    const { name, version: currentVersion } = packageJson;
    const isNightly = currentVersion.includes('nightly');

    if (isNightly) {
      const [nightlyUpdate, latestUpdate] = await Promise.all([
        latestVersion(name, { version: 'nightly' }),
        latestVersion(name),
      ]);

      const bestUpdate = getBestAvailableUpdate(nightlyUpdate, latestUpdate);

      if (bestUpdate && semver.gt(bestUpdate, currentVersion)) {
        const message = `A new version of Gemini CLI is available! ${currentVersion} → ${bestUpdate}`;
        const type = semver.diff(bestUpdate, currentVersion) || undefined;
        return {
          message,
          update: {
            latest: bestUpdate,
            current: currentVersion,
            name,
            type,
          },
        };
      }
    } else {
      const latestUpdate = await latestVersion(name);

      if (latestUpdate && semver.gt(latestUpdate, currentVersion)) {
        const message = `Gemini CLI update available! ${currentVersion} → ${latestUpdate}`;
        const type = semver.diff(latestUpdate, currentVersion) || undefined;
        return {
          message,
          update: {
            latest: latestUpdate,
            current: currentVersion,
            name,
            type,
          },
        };
      }
    }

    return null;
  } catch (e) {
    debugLogger.warn('Failed to check for updates: ' + e);
    return null;
  }
}
