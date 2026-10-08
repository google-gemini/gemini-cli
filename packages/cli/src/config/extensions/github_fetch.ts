/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as https from 'node:https';
import type { LookupFunction } from 'node:net';
import {
  getErrorMessage,
  safeLookup,
  validateUrlDestination,
} from '@google/gemini-cli-core';

export function getGitHubToken(): string | undefined {
  // An empty value counts as unset, so callers never see a blank token.
  return process.env['GITHUB_TOKEN'] || undefined;
}

/**
 * DNS lookup for the HTTPS client. `validateUrlDestination` resolves the host
 * once before the request, but the client resolves it again when it connects,
 * and a host can answer differently the second time. Checking inside the
 * client's own lookup validates the addresses the socket will actually use.
 * Hosts given as IP literals skip the lookup and rely on the earlier check.
 *
 * Node's `LookupFunction` type allows `family` to be 'IPv4' | 'IPv6', which
 * `safeLookup` does not accept, so only a numeric family is forwarded.
 */
const lookupPublicAddress: LookupFunction = (hostname, options, callback) =>
  safeLookup(
    hostname,
    {
      all: options.all,
      family: typeof options.family === 'number' ? options.family : undefined,
    },
    callback,
  );

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
    // Set once a redirect has been handed off to a nested fetchJson call. The
    // original request and response then only drain, and their failures must
    // not settle this promise, which now tracks the redirect target instead.
    let isRedirecting = false;
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
    // Failure path for the original request and response: a no-op once a
    // redirect is in flight, because the redirect then settles the promise.
    const failUnlessRedirecting = (createReason: () => unknown): void => {
      if (!isRedirecting) {
        fail(createReason);
      }
    };

    const requestOptions = {
      headers,
      lookup: lookupPublicAddress,
      timeout: 30000,
    };
    const req = https.get(url, requestOptions, (res) => {
      res.on('error', (error) =>
        failUnlessRedirecting(
          () =>
            new Error(
              `Response error while fetching ${url} (status ${res.statusCode}): ${getErrorMessage(error)}`,
              { cause: error },
            ),
        ),
      );
      res.on('aborted', () =>
        failUnlessRedirecting(
          () =>
            new Error(
              `Response aborted while fetching ${url} (status ${res.statusCode})`,
            ),
        ),
      );

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
    req.on('error', (error) => failUnlessRedirecting(() => error));
    req.on('timeout', () => {
      failUnlessRedirecting(() => new Error('Request timed out after 30000ms'));
      // Always release the original socket. A redirect in flight runs on its
      // own request, so destroying this one does not affect it.
      req.destroy();
    });
  });
}
