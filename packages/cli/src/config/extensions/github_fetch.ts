/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as https from 'node:https';
import { getErrorMessage } from '@google/gemini-cli-core';

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
        let isRedirecting = false;
        res.on('error', (error) => {
          if (!isRedirecting) {
            reject(
              new Error(
                `Response error while fetching ${url} (status ${res.statusCode}): ${getErrorMessage(error)}`,
                { cause: error },
              ),
            );
          }
        });
        res.on('aborted', () => {
          if (!isRedirecting) {
            reject(
              new Error(
                `Response aborted while fetching ${url} (status ${res.statusCode})`,
              ),
            );
          }
        });

        if (res.statusCode === 302 || res.statusCode === 301) {
          if (redirectCount >= 10) {
            res.resume?.();
            return reject(new Error('Too many redirects'));
          }
          if (!res.headers.location) {
            res.resume?.();
            return reject(new Error('No location header in redirect response'));
          }
          let redirectUrl: string;
          try {
            redirectUrl = new URL(res.headers.location, url).toString();
          } catch (error) {
            res.resume?.();
            return reject(
              new Error(
                `Invalid redirect URL from ${url} (status ${res.statusCode}): ${getErrorMessage(error)}`,
                { cause: error },
              ),
            );
          }
          isRedirecting = true;
          res.resume?.();
          fetchJson<T>(redirectUrl, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume?.();
          return reject(
            new Error(`Request failed with status code ${res.statusCode}`),
          );
        }
        let completed = false;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) =>
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk),
        );
        res.on('end', () => {
          if (res.complete === false) {
            reject(
              new Error(
                `Response ended prematurely while fetching ${url} (status ${res.statusCode})`,
              ),
            );
            return;
          }
          completed = true;
          try {
            const data = Buffer.concat(chunks).toString();
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            resolve(JSON.parse(data) as T);
          } catch (error) {
            reject(
              new Error(
                `Failed to parse JSON response from ${url} (status ${res.statusCode}): ${getErrorMessage(error)}`,
                { cause: error },
              ),
            );
          }
        });
        res.on('close', () => {
          if (!completed) {
            reject(
              new Error(
                `Response closed prematurely while fetching ${url} (status ${res.statusCode})`,
              ),
            );
          }
        });
      })
      .on('error', reject);
  });
}
