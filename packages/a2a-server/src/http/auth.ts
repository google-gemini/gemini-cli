/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { UserBuilder } from '@a2a-js/sdk/server/express';
import { logger } from '../utils/logger.js';

// The server listens on localhost, so requests are expected to be addressed to
// a loopback host. Any port is accepted.
const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;
const LOOPBACK_ORIGIN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

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
    const token = /^Bearer +(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    return token !== undefined && timingSafeEqual(sha256(token), expected);
  };
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

  // Requests are not rate limited. All clients connect from the loopback
  // address, so a limit keyed on the address would apply to every client at
  // once.
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
