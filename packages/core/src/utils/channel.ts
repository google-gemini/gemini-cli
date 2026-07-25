/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPackageJson } from './package.js';

export enum ReleaseChannel {
  NIGHTLY = 'nightly',
  PREVIEW = 'preview',
  STABLE = 'stable',
}

/**
 * Stability ranking for release channels. Higher number means more stable.
 */
export const RELEASE_CHANNEL_STABILITY: Record<ReleaseChannel, number> = {
  [ReleaseChannel.NIGHTLY]: 0,
  [ReleaseChannel.PREVIEW]: 1,
  [ReleaseChannel.STABLE]: 2,
};

const cache = new Map<string, ReleaseChannel>();

/**
 * Clears the cache for testing purposes.
 * @private
 */
export function _clearCache() {
  cache.clear();
}

/**
 * Determines the release channel for a given version string.
 */
export function getChannelFromVersion(version: string): ReleaseChannel {
  if (!version || version.includes('nightly')) {
    return ReleaseChannel.NIGHTLY;
  }
  if (version.includes('preview')) {
    return ReleaseChannel.PREVIEW;
  }
  return ReleaseChannel.STABLE;
}

export async function getReleaseChannel(cwd: string): Promise<ReleaseChannel> {
  if (cache.has(cwd)) {
    return cache.get(cwd)!;
  }

  const packageJson = await getPackageJson(cwd);
  const version = packageJson?.version ?? '';

  const channel = getChannelFromVersion(version);
  cache.set(cwd, channel);
  return channel;
}

export async function isNightly(cwd: string): Promise<boolean> {
  return (await getReleaseChannel(cwd)) === ReleaseChannel.NIGHTLY;
}

export async function isPreview(cwd: string): Promise<boolean> {
  return (await getReleaseChannel(cwd)) === ReleaseChannel.PREVIEW;
}

export async function isStable(cwd: string): Promise<boolean> {
  return (await getReleaseChannel(cwd)) === ReleaseChannel.STABLE;
}
