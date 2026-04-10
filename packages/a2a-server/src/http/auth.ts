/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { UserBuilder } from '@a2a-js/sdk/server/express';
import { UnauthenticatedUser } from '@a2a-js/sdk/server';
import { logger } from '../utils/logger.js';

/**
 * Credentials accepted by the a2a-server. Values are loaded from environment
 * variables when provided, otherwise a random bearer token is generated at
 * startup so the server never ships with well-known default credentials.
 */
export interface AgentServerCredentials {
  bearerToken: string;
  basicUsername?: string;
  basicPassword?: string;
}

function generateRandomToken(): string {
  return randomBytes(32).toString('base64url');
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    // Still perform a comparison to keep timing uniform.
    const pad = Buffer.alloc(aBuf.length);
    timingSafeEqual(aBuf, pad);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Loads the credentials used to authenticate requests against the
 * a2a-server's custom HTTP endpoints and the A2A protocol routes.
 *
 * Environment variables:
 *   CODER_AGENT_BEARER_TOKEN   - bearer token; auto-generated if unset
 *   CODER_AGENT_BASIC_USERNAME - optional basic auth username
 *   CODER_AGENT_BASIC_PASSWORD - optional basic auth password
 */
export function loadAgentServerCredentials(): AgentServerCredentials {
  const envBearer = process.env['CODER_AGENT_BEARER_TOKEN']?.trim();
  const bearerToken =
    envBearer && envBearer.length > 0 ? envBearer : generateRandomToken();

  if (!envBearer || envBearer.length === 0) {
    logger.info(
      '[a2a-server] Generated ephemeral bearer token for this process. ' +
        'Set CODER_AGENT_BEARER_TOKEN to supply a stable value.',
    );
  }

  const basicUsername = process.env['CODER_AGENT_BASIC_USERNAME']?.trim();
  const basicPassword = process.env['CODER_AGENT_BASIC_PASSWORD']?.trim();
  const hasBasic =
    !!basicUsername &&
    basicUsername.length > 0 &&
    !!basicPassword &&
    basicPassword.length > 0;

  return {
    bearerToken,
    basicUsername: hasBasic ? basicUsername : undefined,
    basicPassword: hasBasic ? basicPassword : undefined,
  };
}

function verifyAuthorizationHeader(
  header: string | undefined,
  credentials: AgentServerCredentials,
): { userName: string } | null {
  if (!header) return null;

  if (header.startsWith('Bearer ')) {
    const token = header.substring('Bearer '.length);
    if (constantTimeEquals(token, credentials.bearerToken)) {
      return { userName: 'bearer-user' };
    }
    return null;
  }

  if (
    header.startsWith('Basic ') &&
    credentials.basicUsername &&
    credentials.basicPassword
  ) {
    const decoded = Buffer.from(
      header.substring('Basic '.length),
      'base64',
    ).toString('utf8');
    const expected =
      credentials.basicUsername + ':' + credentials.basicPassword;
    if (constantTimeEquals(decoded, expected)) {
      return { userName: 'basic-user' };
    }
    return null;
  }

  return null;
}

/**
 * Builds the {@link UserBuilder} used by the A2A SDK to identify callers of
 * the A2A protocol routes. Returns an unauthenticated user when the supplied
 * credentials do not match.
 */
export function buildAgentUserBuilder(
  credentials: AgentServerCredentials,
): UserBuilder {
  return async (req: Request) => {
    const header = req.headers['authorization'];
    if (header) {
      const scheme = header.split(' ')[0];
      logger.info(
        `[a2a-server] Received Authorization header with scheme: ${scheme}`,
      );
    }
    const verified = verifyAuthorizationHeader(header, credentials);
    if (!verified) return new UnauthenticatedUser();
    return { userName: verified.userName, isAuthenticated: true };
  };
}

/**
 * Express middleware that rejects requests whose Authorization header does
 * not match the process's configured credentials. Applied to the custom
 * (non-A2A-protocol) HTTP endpoints.
 */
export function requireAgentAuth(credentials: AgentServerCredentials) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers['authorization'];
    const verified = verifyAuthorizationHeader(header, credentials);
    if (!verified) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
}
