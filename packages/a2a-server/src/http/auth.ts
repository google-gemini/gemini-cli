/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { UserBuilder } from '@a2a-js/sdk/server/express';
import { logger } from '../utils/logger.js';

// The server listens on localhost, so requests are expected to be addressed to
// a loopback host. Any port is accepted.
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;
const LOOPBACK_ORIGIN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

// Requests that do not carry the configured token are limited to this many per
// window.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 100;

/**
 * Returns the token that clients must send as a bearer token, or `undefined`
 * if none is configured.
 *
 * GEMINI_IPC_SECRET is set by the process that launches the server, such as an
 * IDE integration. CODER_AGENT_AUTH_TOKEN is used when GEMINI_IPC_SECRET is
 * not set, for example when the server is started manually.
 */
export function resolveAuthSecret(): string | undefined {
  return (
    process.env['GEMINI_IPC_SECRET'] ||
    process.env['CODER_AGENT_AUTH_TOKEN'] ||
    undefined
  );
}

/**
 * Validates the Host and Origin headers against loopback addresses.
 *
 * The Host header is required and must name a loopback address. The Origin
 * header is optional; when present, it must be a loopback origin.
 */
export const requireLoopbackRequest: RequestHandler = (req, res, next) => {
  const { host, origin } = req.headers;

  if (host === undefined || !LOOPBACK_HOST.test(host)) {
    logger.warn(
      `[CoreAgent] Rejected request with a non-loopback Host header: ${JSON.stringify(host)}`,
    );
    res.status(403).json({ error: 'Invalid Host header' });
    return;
  }

  if (origin !== undefined && !LOOPBACK_ORIGIN.test(origin)) {
    logger.warn(
      `[CoreAgent] Rejected request with a non-loopback Origin header: ${JSON.stringify(origin)}`,
    );
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  next();
};

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

const BEARER_PREFIX = 'bearer ';

/**
 * Returns the token from an `Authorization: Bearer <token>` header value, or
 * `undefined` if the header does not use the Bearer scheme or has no token.
 * The scheme is case-insensitive and may be followed by more than one space.
 */
function getBearerToken(authorization: string | undefined): string | undefined {
  if (
    authorization === undefined ||
    authorization.slice(0, BEARER_PREFIX.length).toLowerCase() !== BEARER_PREFIX
  ) {
    return undefined;
  }
  let start = BEARER_PREFIX.length;
  while (authorization[start] === ' ') {
    start++;
  }
  return start < authorization.length ? authorization.slice(start) : undefined;
}

/**
 * Builds a predicate that checks a request for
 * `Authorization: Bearer <secret>`.
 *
 * Both values are hashed before being compared, so that `timingSafeEqual`
 * (which requires inputs of equal length) can be used for tokens of any
 * length. Without a configured secret, no request matches.
 */
function createBearerVerifier(
  secret: string | undefined,
): (req: Request) => boolean {
  if (!secret) {
    return () => false;
  }
  const expected = sha256(secret);
  return (req) => {
    const token = getBearerToken(req.headers.authorization);
    return token !== undefined && timingSafeEqual(sha256(token), expected);
  };
}

/**
 * Limits how many requests without the configured bearer token are handled
 * per minute. Requests over the limit are answered with a 429 until the
 * minute has passed.
 *
 * All clients connect from a loopback address and cannot be told apart, so
 * they share one limit. Requests that carry the token are not counted, which
 * keeps other requests from using up the limit of an authenticated client.
 * Without a configured secret, every request is counted.
 */
export function createRateLimiter(secret: string | undefined): RequestHandler {
  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: RATE_LIMIT_MAX_REQUESTS,
    skip: createBearerVerifier(secret),
    // A constant key makes all counted requests share one counter.
    keyGenerator: () => 'requests-without-token',
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests' },
  });
}

/**
 * Requires every request to carry the configured bearer token.
 *
 * If the server was started without a token, there is nothing to compare
 * against and every request is answered with a 500.
 */
export function createAuthMiddleware(
  secret: string | undefined,
): RequestHandler {
  const isAuthenticated = createBearerVerifier(secret);

  return (req, res, next) => {
    if (!secret) {
      res
        .status(500)
        .json({ error: 'Server authentication is not configured.' });
      return;
    }
    if (!isAuthenticated(req)) {
      logger.warn(
        `[CoreAgent] Rejected unauthenticated ${req.method} request.`,
      );
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
}

/**
 * Builds the user that the A2A SDK associates with a request.
 *
 * Requests reach the SDK after the auth middleware. The token is checked again
 * here so that the SDK is only ever given an authenticated user.
 */
export function createUserBuilder(secret: string | undefined): UserBuilder {
  const isAuthenticated = createBearerVerifier(secret);
  return async (req) => {
    if (!isAuthenticated(req)) {
      throw new Error(
        'Unauthenticated request reached the A2A request handler.',
      );
    }
    return { userName: 'bearer-user', isAuthenticated: true };
  };
}
