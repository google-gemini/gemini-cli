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
  const headers: Record<string, string> = {
    'User-Agent': 'gemini-cli',
  };
  const token = getGitHubToken();
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }
  return fetchJsonResponse<T>(url, headers, redirectCount);
}

function fetchJsonResponse<T>(
  url: string,
  headers: Record<string, string>,
  redirectCount: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          drainResponse(res);
          if (redirectCount >= 10) {
            return reject(new Error('Too many redirects'));
          }
          if (!res.headers.location) {
            return reject(new Error('No location header in redirect response'));
          }
          const currentUrl = new URL(url);
          const redirectUrl = new URL(res.headers.location, currentUrl);
          const redirectHeaders = { ...headers };
          if (currentUrl.origin !== redirectUrl.origin) {
            for (const header of Object.keys(redirectHeaders)) {
              if (header.toLowerCase() === 'authorization') {
                delete redirectHeaders[header];
              }
            }
          }
          fetchJsonResponse<T>(
            redirectUrl.toString(),
            redirectHeaders,
            redirectCount + 1,
          )
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          drainResponse(res);
          return reject(
            new Error(`Request failed with status code ${res.statusCode}`),
          );
        }

        const chunks: Buffer[] = [];
        let settled = false;
        res.on('data', (chunk: Buffer) => {
          if (!settled) {
            chunks.push(chunk);
          }
        });
        res.once('error', (error) => {
          if (settled) return;
          settled = true;
          reject(
            new Error(
              `Failed to read GitHub response from ${url} (status 200): ${error.message}`,
              { cause: error },
            ),
          );
        });
        res.once('aborted', () => {
          if (settled) return;
          settled = true;
          reject(
            new Error(`GitHub response was aborted for ${url} (status 200)`),
          );
        });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          const data = Buffer.concat(chunks).toString();
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            resolve(JSON.parse(data) as T);
          } catch (error) {
            reject(
              new Error(
                `Failed to parse GitHub response from ${url} (status 200): ${error instanceof Error ? error.message : String(error)}`,
                { cause: error },
              ),
            );
          }
        });
      })
      .on('error', reject);
  });
}

function drainResponse(response: import('node:http').IncomingMessage): void {
  // Drained responses can still fail mid-stream. Absorb that error because the
  // caller has already received the status/redirect failure for this response.
  response.on('error', () => undefined);
  response.resume();
}
