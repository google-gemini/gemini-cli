/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as https from 'node:https';

export function getGitHubToken(): string | undefined {
  return process.env['GITHUB_TOKEN'];
}

export async function fetchJson<T>(
  url: string,
  redirectCount: number = 0,
): Promise<T> {
  const headers: { 'User-Agent': string; Authorization?: string } = {
    'User-Agent': 'gemini-cli',
  };
  const token = getGitHubToken();
  if (token) {
    headers.Authorization = `token ${token}`;
  }
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          if (redirectCount >= 10) {
            return reject(new Error('Too many redirects'));
          }
          if (!res.headers.location) {
            return reject(new Error('No location header in redirect response'));
          }
          fetchJson<T>(res.headers.location, redirectCount++)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          return reject(
            new Error(`Request failed with status code ${res.statusCode}`),
          );
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString();
          resolve(JSON.parse(data) as T);
        });
      })
      .on('error', reject);
  });
}
