/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared OAuth 2.0 Authorization Code flow primitives with PKCE support.
 *
 * These utilities are protocol-agnostic and can be used by both MCP OAuth
 * and A2A OAuth authentication providers.
 */

import * as http from 'node:http';
import * as crypto from 'node:crypto';
import type * as net from 'node:net';
import { URL } from 'node:url';
import { debugLogger } from './debugLogger.js';
import { validateOAuthEndpointUrl, isLoopbackUrl } from '../mcp/oauth-utils.js';

/**
 * Configuration for an OAuth 2.0 Authorization Code flow.
 * Contains only the fields needed by the shared flow utilities.
 */
export interface OAuthFlowConfig {
  clientId: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes?: string[];
  audiences?: string[];
  redirectUri?: string;
}

/**
 * Configuration subset needed for token refresh operations.
 */
export type OAuthRefreshConfig = Pick<
  OAuthFlowConfig,
  'clientId' | 'clientSecret' | 'scopes' | 'audiences'
>;

/**
 * PKCE (Proof Key for Code Exchange) parameters.
 */
export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

/**
 * OAuth authorization response from the callback server.
 */
export interface OAuthAuthorizationResponse {
  code: string;
  state: string;
  iss?: string;
}

/**
 * OAuth token response from the authorization server.
 */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/** The path the local callback server listens on. */
export const REDIRECT_PATH = '/oauth/callback';

/**
 * Helper to determine the redirect URI, taking Google Cloud Workstations proxy into account.
 */
export function getRedirectUri(
  config: { redirectUri?: string },
  redirectPort: number,
): string {
  if (
    process.env['GOOGLE_CLOUD_WORKSTATIONS'] === 'true' &&
    process.env['WEB_HOST']
  ) {
    if (config.redirectUri) {
      try {
        const parsed = new URL(config.redirectUri);
        if (
          parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          parsed.hostname === '[::1]'
        ) {
          const port = String(redirectPort);
          parsed.protocol = 'https:';
          parsed.hostname = `${port}-${process.env['WEB_HOST']}`;
          parsed.port = '';
          return parsed.toString();
        }
      } catch {
        // Fall back to returning config.redirectUri as-is if parsing fails
      }
      return config.redirectUri;
    }

    return `https://${redirectPort}-${process.env['WEB_HOST']}${REDIRECT_PATH}`;
  }

  if (config.redirectUri) {
    return config.redirectUri;
  }
  return `http://localhost:${redirectPort}${REDIRECT_PATH}`;
}

const HTTP_OK = 200;

/**
 * Generate PKCE parameters for OAuth flow.
 *
 * @returns PKCE parameters including code verifier, challenge, and state
 */
export function generatePKCEParams(): PKCEParams {
  // Generate code verifier (43-128 characters)
  // using 64 bytes results in ~86 characters, safely above the minimum of 43
  const codeVerifier = crypto.randomBytes(64).toString('base64url');

  // Generate code challenge using SHA256
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // Generate state for CSRF protection
  const state = crypto.randomBytes(16).toString('base64url');

  return { codeVerifier, codeChallenge, state };
}

/**
 * Compares two OAuth issuer URLs per RFC 8414 / RFC 9207.
 * Normalizes trailing slashes and origins to ensure consistent matching,
 * while rejecting userinfo (preventing OAuth mix-up attacks) and preserving
 * query parameters and fragments.
 */
export function areIssuersEqual(issuerA: string, issuerB: string): boolean {
  if (issuerA === issuerB && !issuerA.includes('@')) return true;

  const normalize = (iss: string): string | null => {
    try {
      const u = new URL(iss);

      // RFC 8414 & RFC 9207: Valid OAuth issuers MUST NOT contain userinfo.
      // Discarding or accepting userinfo can enable URL confusion / mix-up attacks
      // (e.g., https://attacker.com@github.com/login/oauth).
      if (u.username || u.password) {
        return null;
      }

      // Normalize trailing slashes on pathname (e.g., "/oauth/" -> "/oauth")
      const normalizedPath = u.pathname.replace(/\/+$/, '');

      // Reconstruct canonical URL:
      // - u.protocol and u.host handle lowercasing and default port removal (:443)
      // - normalizedPath handles trailing slash equivalence
      // - u.search and u.hash are preserved so different tenants/queries never collide
      return `${u.protocol}//${u.host}${normalizedPath}${u.search}${u.hash}`;
    } catch {
      // Fallback for non-standard / relative strings
      return iss.replace(/\/+$/, '');
    }
  };

  const normA = normalize(issuerA);
  const normB = normalize(issuerB);

  if (normA === null || normB === null) {
    return false;
  }

  return normA === normB;
}

/**
 * Start a local HTTP server to handle OAuth callback.
 * The server will listen on the specified port (or port 0 for OS assignment).
 *
 * @param expectedState The state parameter to validate
 * @param port Optional preferred port to listen on
 * @param expectedIssuer Optional expected authorization server issuer for RFC 9207 validation
 * @returns Object containing the port (available immediately) and a promise for the auth response
 */
export function startCallbackServer(
  expectedState: string,
  port?: number,
  expectedIssuer?: string,
): {
  port: Promise<number>;
  response: Promise<OAuthAuthorizationResponse>;
} {
  let portResolve: (port: number) => void;
  let portReject: (error: Error) => void;
  const portPromise = new Promise<number>((resolve, reject) => {
    portResolve = resolve;
    portReject = reject;
  });

  let timeoutId: NodeJS.Timeout | undefined;

  const responsePromise = new Promise<OAuthAuthorizationResponse>(
    (resolve, reject) => {
      let serverPort: number;

      const server = http.createServer(
        async (req: http.IncomingMessage, res: http.ServerResponse) => {
          try {
            const url = new URL(req.url!, `http://localhost:${serverPort}`);

            if (url.pathname !== REDIRECT_PATH) {
              res.writeHead(404);
              res.end('Not found');
              return;
            }

            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            const error = url.searchParams.get('error');
            const iss = url.searchParams.get('iss') || undefined;

            if (error) {
              debugLogger.warn(`OAuth callback received error: ${error}`);
              res.writeHead(HTTP_OK, { 'Content-Type': 'text/html' });
              res.end(`
              <html>
                <body>
                  <h1>Authentication Failed</h1>
                  <p>Error: ${error.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                  <p>${(url.searchParams.get('error_description') || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
              server.close();
              reject(new Error(`OAuth error: ${error}`));
              return;
            }

            if (!code || !state) {
              debugLogger.warn(
                'OAuth callback rejected: Missing code or state parameter.',
              );
              res.writeHead(400);
              res.end('Missing code or state parameter');
              return;
            }

            if (state !== expectedState) {
              debugLogger.error(
                `OAuth callback state mismatch: received state "${state}", expected "${expectedState}". Possible CSRF attack.`,
              );
              res.writeHead(400);
              res.end('Invalid state parameter');
              server.close();
              reject(new Error('State mismatch - possible CSRF attack'));
              return;
            }

            // RFC 9207 Authorization Server Issuer Identification check
            if (expectedIssuer) {
              // Fail-closed: if an issuer was expected, the response MUST include it
              if (!iss) {
                debugLogger.error(
                  'OAuth callback rejected: Missing required "iss" parameter when an expected issuer is configured. Possible IdP mix-up attack (RFC 9207).',
                );
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`
                <html>
                  <body>
                    <h1>Authentication Failed</h1>
                    <p>Error: Missing issuer parameter in response.</p>
                    <p>You can close this window.</p>
                  </body>
                </html>
              `);
                server.close();
                reject(
                  new Error(
                    'Missing "iss" parameter in authorization response per RFC 9207',
                  ),
                );
                return;
              }

              if (!areIssuersEqual(iss, expectedIssuer)) {
                debugLogger.error(
                  'OAuth callback rejected: Issuer mismatch between authorization response and expected authorization server. Possible IdP mix-up attack (RFC 9207).',
                );
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`
                <html>
                  <body>
                    <h1>Authentication Failed</h1>
                    <p>Error: Issuer mismatch - possible OAuth mix-up attack.</p>
                    <p>You can close this window.</p>
                  </body>
                </html>
              `);
                server.close();
                reject(
                  new Error(
                    'Issuer mismatch in authorization response - possible OAuth mix-up attack',
                  ),
                );
                return;
              }
              debugLogger.debug(
                '✓ OAuth callback issuer validated successfully.',
              );
            } else if (iss) {
              debugLogger.debug(
                'OAuth callback received "iss" parameter (no expected issuer was configured).',
              );
            }

            // Send success response to browser
            res.writeHead(HTTP_OK, { 'Content-Type': 'text/html' });
            res.end(`
            <html>
              <body>
                <h1>Authentication Successful!</h1>
                <p>You can close this window and return to Gemini CLI.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);

            server.close();
            resolve({ code, state, iss });
          } catch (error) {
            server.close();
            reject(error);
          }
        },
      );

      server.on('error', (error) => {
        portReject(error);
        reject(error);
      });

      // Determine which port to use (env var, argument, or OS-assigned)
      let listenPort = 0; // Default to OS-assigned port

      const portStr = process.env['OAUTH_CALLBACK_PORT'];
      if (portStr) {
        const envPort = parseInt(portStr, 10);
        if (isNaN(envPort) || envPort <= 0 || envPort > 65535) {
          const error = new Error(
            `Invalid value for OAUTH_CALLBACK_PORT: "${portStr}"`,
          );
          portReject(error);
          reject(error);
          return;
        }
        listenPort = envPort;
      } else if (port !== undefined) {
        listenPort = port;
      }

      server.listen(listenPort, () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const address = server.address() as net.AddressInfo;
        serverPort = address.port;
        debugLogger.log(
          `OAuth callback server listening on port ${serverPort}`,
        );
        portResolve(serverPort); // Resolve port promise immediately
      });

      const abortController = new AbortController();
      timeoutId = setTimeout(
        () => {
          abortController.abort(new Error('OAuth callback timeout'));
        },
        5 * 60 * 1000,
      );
      timeoutId.unref();

      const onAbort = () => {
        server.close();
        reject(abortController.signal.reason);
      };
      abortController.signal.addEventListener('abort', onAbort, { once: true });

      server.on('close', () => {
        abortController.signal.removeEventListener('abort', onAbort);
      });
    },
  );

  return {
    port: portPromise,
    response: responsePromise,
  };
}

/**
 * Extract the port number from a URL string if available and valid.
 *
 * @param urlString The URL string to parse
 * @returns The port number or undefined if not found or invalid
 */
export function getPortFromUrl(urlString?: string): number | undefined {
  if (!urlString) {
    return undefined;
  }

  try {
    const url = new URL(urlString);
    if (url.port) {
      const parsedPort = parseInt(url.port, 10);
      if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
        return parsedPort;
      }
    }
  } catch {
    // Ignore invalid URL
  }

  return undefined;
}

/**
 * Build the authorization URL for the OAuth flow.
 *
 * @param config OAuth flow configuration
 * @param pkceParams PKCE parameters
 * @param redirectPort The port to use for the redirect URI
 * @param resource Optional resource parameter value (RFC 8707)
 * @returns The authorization URL
 */
export function buildAuthorizationUrl(
  config: OAuthFlowConfig,
  pkceParams: PKCEParams,
  redirectPort: number,
  resource?: string,
): string {
  const redirectUri = getRedirectUri(config, redirectPort);

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    state: pkceParams.state,
    code_challenge: pkceParams.codeChallenge,
    code_challenge_method: 'S256',
  });

  if (config.scopes && config.scopes.length > 0) {
    params.append('scope', config.scopes.join(' '));
  }

  if (config.audiences && config.audiences.length > 0) {
    params.append('audience', config.audiences.join(' '));
  }

  if (resource) {
    params.append('resource', resource);
  }

  const url = new URL(config.authorizationUrl);
  params.forEach((value, key) => {
    url.searchParams.append(key, value);
  });
  return url.toString();
}

/**
 * Parse a token endpoint response, handling both JSON and form-urlencoded formats.
 *
 * @param response The HTTP response from the token endpoint
 * @param operationName Human-readable operation name for error messages (e.g., "Token exchange", "Token refresh")
 * @param defaultErrorCode Default error code when access_token is missing (e.g., "no_access_token", "unknown_error")
 * @returns The parsed token response
 */
async function parseTokenEndpointResponse(
  response: Response,
  operationName: string,
  defaultErrorCode: string,
): Promise<OAuthTokenResponse> {
  const responseText = await response.text();
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    // Try to parse error from form-urlencoded response
    let errorMessage: string | null = null;
    try {
      const errorParams = new URLSearchParams(responseText);
      const error = errorParams.get('error');
      const errorDescription = errorParams.get('error_description');
      if (error) {
        errorMessage = `${operationName} failed: ${error} - ${errorDescription || 'No description'}`;
      }
    } catch {
      // Fall back to raw error
    }
    throw new Error(
      errorMessage ||
        `${operationName} failed: ${response.status} - ${responseText}`,
    );
  }

  // Log unexpected content types for debugging
  if (
    !contentType.includes('application/json') &&
    !contentType.includes('application/x-www-form-urlencoded')
  ) {
    debugLogger.warn(
      `${operationName} endpoint returned unexpected content-type: ${contentType}. ` +
        `Expected application/json or application/x-www-form-urlencoded. ` +
        `Will attempt to parse response.`,
    );
  }

  // Try to parse as JSON first, fall back to form-urlencoded
  try {
    const data: unknown = JSON.parse(responseText);
    if (
      data &&
      typeof data === 'object' &&
      'access_token' in data &&
      // eslint-disable-next-line no-restricted-syntax
      typeof (data as Record<string, unknown>)['access_token'] === 'string'
    ) {
      const obj = data as Record<string, unknown>;
      const result: OAuthTokenResponse = {
        access_token: String(obj['access_token']),
        token_type:
          // eslint-disable-next-line no-restricted-syntax
          typeof obj['token_type'] === 'string' ? obj['token_type'] : 'Bearer',
        expires_in:
          // eslint-disable-next-line no-restricted-syntax
          typeof obj['expires_in'] === 'number' ? obj['expires_in'] : undefined,
        refresh_token:
          // eslint-disable-next-line no-restricted-syntax
          typeof obj['refresh_token'] === 'string'
            ? obj['refresh_token']
            : undefined,
        // eslint-disable-next-line no-restricted-syntax
        scope: typeof obj['scope'] === 'string' ? obj['scope'] : undefined,
      };
      return result;
    }
    // JSON parsed but doesn't look like a token response — fall through
  } catch {
    // Not JSON — fall through to form-urlencoded parsing
  }

  // Parse form-urlencoded response
  const tokenParams = new URLSearchParams(responseText);
  const accessToken = tokenParams.get('access_token');
  const tokenType = tokenParams.get('token_type') || 'Bearer';
  const expiresIn = tokenParams.get('expires_in');
  const refreshToken = tokenParams.get('refresh_token');
  const scope = tokenParams.get('scope');

  if (!accessToken) {
    // Check for error in response
    const error = tokenParams.get('error');
    const errorDescription = tokenParams.get('error_description');
    throw new Error(
      `${operationName} failed: ${error || defaultErrorCode} - ${errorDescription || responseText}`,
    );
  }

  return {
    access_token: accessToken,
    token_type: tokenType,
    expires_in: expiresIn ? parseInt(expiresIn, 10) : undefined,
    refresh_token: refreshToken || undefined,
    scope: scope || undefined,
  } as OAuthTokenResponse;
}

/**
 * Exchange an authorization code for tokens.
 *
 * @param config OAuth flow configuration
 * @param code Authorization code
 * @param codeVerifier PKCE code verifier
 * @param redirectPort The port to use for the redirect URI
 * @param resource Optional resource parameter value (RFC 8707)
 * @returns The token response
 */
export async function exchangeCodeForToken(
  config: OAuthFlowConfig,
  code: string,
  codeVerifier: string,
  redirectPort: number,
  resource?: string,
): Promise<OAuthTokenResponse> {
  const redirectUri = getRedirectUri(config, redirectPort);

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    client_id: config.clientId,
  });

  if (config.clientSecret) {
    params.append('client_secret', config.clientSecret);
  }

  if (config.audiences && config.audiences.length > 0) {
    params.append('audience', config.audiences.join(' '));
  }

  if (resource) {
    params.append('resource', resource);
  }

  const allowLoopback = resource
    ? isLoopbackUrl(resource)
    : isLoopbackUrl(config.tokenUrl);
  const validatedTokenUrl = await validateOAuthEndpointUrl(config.tokenUrl, {
    allowLoopback,
  });

  const response = await fetch(validatedTokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json, application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  return parseTokenEndpointResponse(
    response,
    'Token exchange',
    'no_access_token',
  );
}

/**
 * Refresh an access token using a refresh token.
 *
 * @param config OAuth configuration subset needed for refresh
 * @param refreshToken The refresh token
 * @param tokenUrl The token endpoint URL
 * @param resource Optional resource parameter value (RFC 8707)
 * @returns The new token response
 */
export async function refreshAccessToken(
  config: OAuthRefreshConfig,
  refreshToken: string,
  tokenUrl: string,
  resource?: string,
): Promise<OAuthTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
  });

  if (config.clientSecret) {
    params.append('client_secret', config.clientSecret);
  }

  if (config.scopes && config.scopes.length > 0) {
    params.append('scope', config.scopes.join(' '));
  }

  if (config.audiences && config.audiences.length > 0) {
    params.append('audience', config.audiences.join(' '));
  }

  if (resource) {
    params.append('resource', resource);
  }

  const allowLoopback = resource
    ? isLoopbackUrl(resource)
    : isLoopbackUrl(tokenUrl);
  const validatedTokenUrl = await validateOAuthEndpointUrl(tokenUrl, {
    allowLoopback,
  });

  const response = await fetch(validatedTokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json, application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  return parseTokenEndpointResponse(response, 'Token refresh', 'unknown_error');
}
