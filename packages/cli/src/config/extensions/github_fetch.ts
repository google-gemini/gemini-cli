/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getGitHubToken } from './github.js';
import * as https from 'node:https';

export async function fetchJson<T>(url: string): Promise<T> {
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
