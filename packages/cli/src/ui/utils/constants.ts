/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const NPM_DIST_TAGS = {
  LATEST: 'latest' as const,
  NIGHTLY: 'nightly' as const,
};

export const HOMEBREW_API = {
  URL: 'https://formulae.brew.sh/api/formula/gemini-cli.json',
};

export const MESSAGES = {
  UPDATE_AVAILABLE: (currentVersion: string, latestVersion: string) =>
    `A new version of Gemini CLI is available! ${currentVersion} → ${latestVersion}`,
};
