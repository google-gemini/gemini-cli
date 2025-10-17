/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as https from 'node:https';
import { retryWithBackoff } from '../../utils/retryUtils.js';

export function getGitHubToken(): string | undefined {
  return process.env['GITHUB_TOKEN'];
}

export async function fetchJson<T>(url: string): Promise<T> {
  // Validate URL format
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Only HTTPS URLs are allowed for security reasons');
    }
  } catch (error) {
    throw new Error(
      `Invalid URL: ${url}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Use retry logic for network resilience
  return retryWithBackoff(
    async () => {
      const headers: { 'User-Agent': string; Authorization?: string } = {
        'User-Agent': 'gemini-cli',
      };
      const token = getGitHubToken();
      if (token) {
        headers.Authorization = `token ${token}`;
      }
      return new Promise<T>((resolve, reject) => {
        https
          .get(url, { headers }, (res) => {
            if (res.statusCode !== 200) {
              const error = new Error(
                `Request to ${url} failed with status code ${res.statusCode}${res.statusMessage ? ': ' + res.statusMessage : ''}`,
              ) as Error & { statusCode?: number };
              error.statusCode = res.statusCode;
              return reject(error);
            }
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
              try {
                const data = Buffer.concat(chunks).toString();
                resolve(JSON.parse(data) as T);
              } catch (error) {
                reject(
                  new Error(
                    `Failed to parse JSON response from ${url}: ${error instanceof Error ? error.message : String(error)}`,
                  ),
                );
              }
            });
          })
          .on('error', (error) => {
            reject(
              new Error(
                `Network error while fetching ${url}: ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
          });
      });
    },
    {
      maxRetries: 3,
      initialDelay: 1000,
      logRetries: false, // GitHub operations are common, don't spam logs
    },
  );
}
