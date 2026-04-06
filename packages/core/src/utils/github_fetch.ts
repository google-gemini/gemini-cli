/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchWithTimeout } from './fetch.js';

export function getGitHubToken(): string | undefined {
  return process.env['GITHUB_TOKEN'];
}

const GITHUB_API_TIMEOUT = 10000; // 10 seconds

/**
 * Fetches JSON data from a GitHub API URL.
 * Handles redirection and authentication via GITHUB_TOKEN.
 */
export async function fetchJson<T>(
  url: string,
  _redirectCount: number = 0,
): Promise<T> {
  const headers: Record<string, string> = {
    'User-Agent': 'gemini-cli',
    Accept: 'application/vnd.github+json',
  };
  
  const token = getGitHubToken();
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  const response = await fetchWithTimeout(url, GITHUB_API_TIMEOUT, { headers });

  if (!response.ok) {
    throw new Error(`Request failed with status code ${response.status}: ${response.statusText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return (await response.json()) as T;
}
