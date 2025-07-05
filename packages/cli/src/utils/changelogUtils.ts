/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { request } from 'gaxios';

export interface ReleaseInfo {
  name: string;
  tag_name: string;
  body: string;
  published_at: string;
  html_url: string;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const response = await request<ReleaseInfo>({
      url: 'https://api.github.com/repos/google-gemini/gemini-cli/releases/latest',
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'gemini-cli',
      },
      timeout: 5000,
    });

    return response.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to fetch release info:', message);
    return null;
  }
}

export function formatChangelog(release: ReleaseInfo): string {
  const lines = [`**Gemini CLI ${release.name}**`, ''];

  // Format the release body
  if (release.body) {
    // Clean up Windows line endings
    const cleanBody = release.body.replace(/\r\n/g, '\n').trim();
    lines.push(cleanBody);
    lines.push('');
  }

  // Add footer with link to full release
  lines.push(`For full details, visit: ${release.html_url}`);

  return lines.join('\n');
}
