/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UpdateInfo } from 'update-notifier';
import updateNotifier from 'update-notifier';
import { HOMEBREW_API, NPM_DIST_TAGS } from './constants.js';

/**
 * An abstract interface for a class that can provide information about
 * available software updates.
 */
export interface UpdateProvider {
  fetchUpdate(): Promise<UpdateInfo | null>;
}

export class NpmUpdateProvider implements UpdateProvider {
  constructor(
    private readonly distTag: (typeof NPM_DIST_TAGS)[keyof typeof NPM_DIST_TAGS],
    private readonly currentVersion: string,
    private readonly packageName: string,
  ) {}

  async fetchUpdate(): Promise<UpdateInfo | null> {
    try {
      const notifier = updateNotifier({
        pkg: {
          name: this.packageName,
          version: this.currentVersion,
        },
        updateCheckInterval: 0,
        shouldNotifyInNpmScript: true,
        distTag: this.distTag,
      });
      return await notifier.fetchInfo();
    } catch (e) {
      console.warn(`Failed to check for npm updates (${this.distTag}):`, e);
      return null;
    }
  }
}

export class HomebrewUpdateProvider implements UpdateProvider {
  constructor(private readonly currentVersion: string) {}

  async fetchUpdate(): Promise<UpdateInfo | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout

    try {
      const response = await fetch(HOMEBREW_API.URL, {
        signal: controller.signal,
      });
      if (!response.ok) {
        return null;
      }
      const brewInfo = await response.json();
      const latestVersion = brewInfo?.versions?.stable;

      if (latestVersion) {
        return {
          latest: latestVersion,
          current: this.currentVersion,
          type: NPM_DIST_TAGS.LATEST,
          name: 'gemini-cli',
        };
      }
    } catch (e) {
      // Timeouts are expected under certain network conditions, so we can ignore them.
      if ((e as Error).name !== 'AbortError') {
        console.warn('Failed to check for Homebrew updates:', e);
      }
    } finally {
      clearTimeout(timeoutId);
    }
    return null;
  }
}
