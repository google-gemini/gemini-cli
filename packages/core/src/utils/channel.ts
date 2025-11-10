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

const cache = new Map<string, ReleaseChannel>();

/**
 * Clears the cache for testing purposes.
 * @private
 */
export function _clearCache() {
  cache.clear();
}

export async function getReleaseChannel(cwd: string): Promise<ReleaseChannel> {
  if (cache.has(cwd)) {
    return cache.get(cwd)!;
  }

  const packageJson = await getPackageJson(cwd);
  const version = packageJson?.version ?? '';

  let channel: ReleaseChannel;
  if (version.includes('nightly') || version === '') {
    channel = ReleaseChannel.NIGHTLY;
  } else if (version.includes('preview')) {
    channel = ReleaseChannel.PREVIEW;
  } else {
    channel = ReleaseChannel.STABLE;
  }
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
