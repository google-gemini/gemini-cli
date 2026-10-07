/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as https from 'node:https';
import {
  getErrorMessage,
  validateUrlDestination,
} from '@google/gemini-cli-core';

export function getGitHubToken(): string | undefined {
  return process.env['GITHUB_TOKEN'];
}

export async function fetchJson<T>(
  url: string,
  redirectCount: number = 0,
): Promise<T> {
  if (!(await validateUrlDestination(url))) {
    throw new Error(`Access to blocked or private host ${url} is not allowed.`);
  }

  const headers: { 'User-Agent': string; Authorization?: string } = {
    'User-Agent': 'gemini-cli',
  };
  const token = getGitHubToken();
  if (token) {
    try {
      const parsedUrl = new URL(url);
      if (
        parsedUrl.protocol === 'https:' &&
        (parsedUrl.hostname === 'github.com' ||
          parsedUrl.hostname.endsWith('.github.com'))
      ) {
        headers.Authorization = `token ${token}`;
      }
    } catch {
      // Do not attach token if URL is invalid
    }
  }
  return new Promise((resolve, reject) => {
    // A single failure can emit several lifecycle events (for example
    // 'aborted', then 'error', then 'close'). Settle the promise exactly once
    // and skip building errors for any event that arrives afterwards.
    let settled = false;
    const succeed = (value: T): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const fail = (createReason: () => unknown): void => {
      if (!settled) {
        settled = true;
        reject(createReason());
      }
    };

    const req = https.get(url, { headers, timeout: 30000 }, (res) => {
      let isRedirecting = false;
      res.on('error', (error) => {
        if (!isRedirecting) {
          fail(
            () =>
              new Error(
                `Response error while fetching ${url} (status ${res.statusCode}): ${getErrorMessage(error)}`,
                { cause: error },
              ),
          );
        }
      });
      res.on('aborted', () => {
        if (!isRedirecting) {
          fail(
            () =>
              new Error(
                `Response aborted while fetching ${url} (status ${res.statusCode})`,
              ),
          );
        }
      });

      if (res.statusCode === 302 || res.statusCode === 301) {
        if (redirectCount >= 10) {
          res.resume?.();
          return fail(() => new Error('Too many redirects'));
        }
        if (!res.headers.location) {
          res.resume?.();
          return fail(
            () => new Error('No location header in redirect response'),
          );
        }
        let redirectUrl: string;
        try {
          redirectUrl = new URL(res.headers.location, url).toString();
        } catch (error) {
          res.resume?.();
          return fail(
            () =>
              new Error(
                `Invalid redirect URL from ${url} (status ${res.statusCode}): ${getErrorMessage(error)}`,
                { cause: error },
              ),
          );
        }
        isRedirecting = true;
        res.resume?.();
        fetchJson<T>(redirectUrl, redirectCount + 1).then(
          succeed,
          (error: unknown) => fail(() => error),
        );
        return;
      }
      if (res.statusCode !== 200) {
        res.resume?.();
        return fail(
          () => new Error(`Request failed with status code ${res.statusCode}`),
        );
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer | string) =>
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk),
      );
      res.on('end', () => {
        if (res.complete === false) {
          fail(
            () =>
              new Error(
                `Response ended prematurely while fetching ${url} (status ${res.statusCode})`,
              ),
          );
          return;
        }
        try {
          const data = Buffer.concat(chunks).toString();
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          succeed(JSON.parse(data) as T);
        } catch (error) {
          fail(
            () =>
              new Error(
                `Failed to parse JSON response from ${url} (status ${res.statusCode}): ${getErrorMessage(error)}`,
                { cause: error },
              ),
          );
        }
      });
      res.on('close', () => {
        fail(
          () =>
            new Error(
              `Response closed prematurely while fetching ${url} (status ${res.statusCode})`,
            ),
        );
      });
    });
    req.on('error', (error) => fail(() => error));
    req.on('timeout', () => {
      fail(() => new Error('Request timed out after 30000ms'));
      req.destroy();
    });
  });
}
