/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Credentials } from 'google-auth-library';
import {
  OAuth2Client,
  Compute,
  CodeChallengeMethod,
} from 'google-auth-library';
import * as http from 'node:http';
import url from 'node:url';
import crypto from 'node:crypto';
import * as net from 'node:net';
import open from 'open';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Config } from '../config/config.js';
import { getErrorMessage, FatalAuthenticationError } from '../utils/errors.js';
import { UserAccountManager } from '../utils/userAccountManager.js';
import { AuthType } from '../core/contentGenerator.js';
import readline from 'node:readline';
import { Storage } from '../config/storage.js';

const userAccountManager = new UserAccountManager();

//  OAuth Client ID used to initiate OAuth2Client class.
const OAUTH_CLIENT_ID =
  '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';

// OAuth Secret value used to initiate OAuth2Client class.
// Note: It's ok to save this in git because this is an installed application
// as described here: https://developers.google.com/identity/protocols/oauth2#installed
// "The process results in a client ID and, in some cases, a client secret,
// which you embed in the source code of your application. (In this context,
// the client secret is obviously not treated as a secret.)"
const OAUTH_CLIENT_SECRET = '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';

// OAuth Scopes for Cloud Code authorization.
const OAUTH_SCOPE = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const HTTP_REDIRECT = 301;
const SIGN_IN_SUCCESS_URL =
  'https://developers.google.com/gemini-code-assist/auth_success_gemini';
const SIGN_IN_FAILURE_URL =
  'https://developers.google.com/gemini-code-assist/auth_failure_gemini';

/**
 * An Authentication URL for updating the credentials of a Oauth2Client
 * as well as a promise that will resolve when the credentials have
 * been refreshed (or which throws error when refreshing credentials failed).
 */
export interface OauthWebLogin {
  authUrl: string;
  loginCompletePromise: Promise<void>;
}

const oauthClientPromises = new Map<AuthType, Promise<OAuth2Client>>();

async function initOauthClient(
  authType: AuthType,
  config: Config,
): Promise<OAuth2Client> {
  const client = new OAuth2Client({
    clientId: OAUTH_CLIENT_ID,
    clientSecret: OAUTH_CLIENT_SECRET,
    transporterOptions: {
      proxy: config.getProxy(),
    },
  });

  if (
    process.env['GOOGLE_GENAI_USE_GCA'] &&
    process.env['GOOGLE_CLOUD_ACCESS_TOKEN']
  ) {
    client.setCredentials({
      access_token: process.env['GOOGLE_CLOUD_ACCESS_TOKEN'],
    });
    await fetchAndCacheUserInfo(client);
    return client;
  }

  client.on('tokens', async (tokens: Credentials) => {
    await cacheCredentials(tokens);
  });

  // If there are cached creds on disk, they always take precedence
  if (await loadCachedCredentials(client)) {
    // Found valid cached credentials.
    // Check if we need to retrieve Google Account ID or Email
    if (!userAccountManager.getCachedGoogleAccount()) {
      try {
        await fetchAndCacheUserInfo(client);
      } catch (error) {
        // Non-fatal, continue with existing auth.
        console.warn('Failed to fetch user info:', getErrorMessage(error));
      }
    }
    console.log('Loaded cached credentials.');
    return client;
  }

  // In Google Cloud Shell, we can use Application Default Credentials (ADC)
  // provided via its metadata server to authenticate non-interactively using
  // the identity of the user logged into Cloud Shell.
  if (authType === AuthType.CLOUD_SHELL) {
    try {
      console.log("Attempting to authenticate via Cloud Shell VM's ADC.");
      const computeClient = new Compute({
        // We can leave this empty, since the metadata server will provide
        // the service account email.
      });
      await computeClient.getAccessToken();
      console.log('Authentication successful.');

      // Do not cache creds in this case; note that Compute client will handle its own refresh
      return computeClient;
    } catch (e) {
      throw new Error(
        `Could not authenticate using Cloud Shell credentials. Please select a different authentication method or ensure you are in a properly configured environment. Error: ${getErrorMessage(
          e,
        )}`,
      );
    }
  }

  if (config.isBrowserLaunchSuppressed()) {
    let success = false;
    const maxRetries = 2;
    for (let i = 0; !success && i < maxRetries; i++) {
      success = await authWithUserCode(client);
      if (!success) {
        console.error(
          '\nFailed to authenticate with user code.',
          i === maxRetries - 1 ? '' : 'Retrying...\n',
        );
      }
    }
    if (!success) {
      throw new FatalAuthenticationError(
        'Failed to authenticate with user code.',
      );
    }
  } else {
    const webLogin = await authWithWeb(client);

    console.log(
      `\n\nCode Assist login required.\n` +
        `Attempting to open authentication page in your browser.\n` +
        `Otherwise navigate to:\n\n${webLogin.authUrl}\n\n`,
    );
    try {
      // Attempt to open the authentication URL in the default browser.
      // We do not use the `wait` option here because the main script's execution
      // is already paused by `loginCompletePromise`, which awaits the server callback.
      const childProcess = await open(webLogin.authUrl);

      // IMPORTANT: Attach an error handler to the returned child process.
      // Without this, if `open` fails to spawn a process (e.g., `xdg-open` is not found
      // in a minimal Docker container), it will emit an unhandled 'error' event,
      // causing the entire Node.js process to crash.
      childProcess.on('error', (error) => {
        console.error(
          'Failed to open browser automatically. Please try running again with NO_BROWSER=true set.',
        );
        console.error('Browser error details:', getErrorMessage(error));
      });
    } catch (err) {
      console.error(
        'An unexpected error occurred while trying to open the browser:',
        getErrorMessage(err),
        '\nThis might be due to browser compatibility issues or system configuration.',
        '\nPlease try running again with NO_BROWSER=true set for manual authentication.',
      );
      throw new FatalAuthenticationError(
        `Failed to open browser: ${getErrorMessage(err)}`,
      );
    }
    console.log('Waiting for authentication...');

    // Add timeout to prevent infinite waiting when browser tab gets stuck
    const authTimeout = 5 * 60 * 1000; // 5 minutes timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new FatalAuthenticationError(
            'Authentication timed out after 5 minutes. The browser tab may have gotten stuck in a loading state. ' +
              'Please try again or use NO_BROWSER=true for manual authentication.',
          ),
        );
      }, authTimeout);
    });

    await Promise.race([webLogin.loginCompletePromise, timeoutPromise]);
  }

  return client;
}

export async function getOauthClient(
  authType: AuthType,
  config: Config,
): Promise<OAuth2Client> {
  if (!oauthClientPromises.has(authType)) {
    oauthClientPromises.set(authType, initOauthClient(authType, config));
  }
  return oauthClientPromises.get(authType)!;
}

async function authWithUserCode(client: OAuth2Client): Promise<boolean> {
  const redirectUri = 'https://codeassist.google.com/authcode';
  const codeVerifier = await client.generateCodeVerifierAsync();
  const state = crypto.randomBytes(32).toString('hex');
  const authUrl: string = client.generateAuthUrl({
    redirect_uri: redirectUri,
    access_type: 'offline',
    scope: OAUTH_SCOPE,
    code_challenge_method: CodeChallengeMethod.S256,
    code_challenge: codeVerifier.codeChallenge,
    state,
  });
  console.log('Please visit the following URL to authorize the application:');
  console.log('');
  console.log(authUrl);
  console.log('');

  const code = await new Promise<string>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('Enter the authorization code: ', (code) => {
      rl.close();
      resolve(code.trim());
    });
  });

  if (!code) {
    console.error('Authorization code is required.');
    return false;
  }

  try {
    const { tokens } = await client.getToken({
      code,
      codeVerifier: codeVerifier.codeVerifier,
      redirect_uri: redirectUri,
    });
    client.setCredentials(tokens);
  } catch (error) {
    console.error(
      'Failed to authenticate with authorization code:',
      getErrorMessage(error),
    );
    return false;
  }
  return true;
}

async function authWithWeb(client: OAuth2Client): Promise<OauthWebLogin> {
  const port = await getAvailablePort();
  // The hostname used for the HTTP server binding (e.g., '0.0.0.0' in Docker).
  const host = process.env['OAUTH_CALLBACK_HOST'] || 'localhost';
  // The `redirectUri` sent to Google's authorization server MUST use a loopback IP literal
  // (i.e., 'localhost' or '127.0.0.1'). This is a strict security policy for credentials of
  // type 'Desktop app' or 'Web application' (when using loopback flow) to mitigate
  // authorization code interception attacks.
  const redirectUri = `http://localhost:${port}/oauth2callback`;
  const state = crypto.randomBytes(32).toString('hex');
  const authUrl = client.generateAuthUrl({
    redirect_uri: redirectUri,
    access_type: 'offline',
    scope: OAUTH_SCOPE,
    state,
  });

  const loginCompletePromise = new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (req.url!.indexOf('/oauth2callback') === -1) {
          res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_FAILURE_URL });
          res.end();
          reject(
            new FatalAuthenticationError(
              'OAuth callback not received. Unexpected request: ' + req.url,
            ),
          );
        }
        // acquire the code from the querystring, and close the web server.
        const qs = new url.URL(req.url!, 'http://localhost:3000').searchParams;
        if (qs.get('error')) {
          res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_FAILURE_URL });
          res.end();

          const errorCode = qs.get('error');
          const errorDescription =
            qs.get('error_description') || 'No additional details provided';
          reject(
            new FatalAuthenticationError(
              `Google OAuth error: ${errorCode}. ${errorDescription}`,
            ),
          );
        } else if (qs.get('state') !== state) {
          res.end('State mismatch. Possible CSRF attack');

          reject(
            new FatalAuthenticationError(
              'OAuth state mismatch. Possible CSRF attack or browser session issue.',
            ),
          );
        } else if (qs.get('code')) {
          try {
            const { tokens } = await client.getToken({
              code: qs.get('code')!,
              redirect_uri: redirectUri,
            });
            client.setCredentials(tokens);

            // Retrieve and cache Google Account ID during authentication
            try {
              await fetchAndCacheUserInfo(client);
            } catch (error) {
              console.warn(
                'Failed to retrieve Google Account ID during authentication:',
                getErrorMessage(error),
              );
              // Don't fail the auth flow if Google Account ID retrieval fails
            }

            res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_SUCCESS_URL });
            res.end();
            resolve();
          } catch (error) {
            res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_FAILURE_URL });
            res.end();
            reject(
              new FatalAuthenticationError(
                `Failed to exchange authorization code for tokens: ${getErrorMessage(error)}`,
              ),
            );
          }
        } else {
          reject(
            new FatalAuthenticationError(
              'No authorization code received from Google OAuth. Please try authenticating again.',
            ),
          );
        }
      } catch (e) {
        // Provide more specific error message for unexpected errors during OAuth flow
        if (e instanceof FatalAuthenticationError) {
          reject(e);
        } else {
          reject(
            new FatalAuthenticationError(
              `Unexpected error during OAuth authentication: ${getErrorMessage(e)}`,
            ),
          );
        }
      } finally {
        server.close();
      }
    });

    server.listen(port, host, () => {
      // Server started successfully
    });

    server.on('error', (err) => {
      reject(
        new FatalAuthenticationError(
          `OAuth callback server error: ${getErrorMessage(err)}`,
        ),
      );
    });
  });

  return {
    authUrl,
    loginCompletePromise,
  };
}

export function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = 0;
    try {
      const portStr = process.env['OAUTH_CALLBACK_PORT'];
      if (portStr) {
        port = parseInt(portStr, 10);
        if (isNaN(port) || port <= 0 || port > 65535) {
          return reject(
            new Error(`Invalid value for OAUTH_CALLBACK_PORT: "${portStr}"`),
          );
        }
        return resolve(port);
      }
      const server = net.createServer();
      server.listen(0, () => {
        const address = server.address()! as net.AddressInfo;
        port = address.port;
      });
      server.on('listening', () => {
        server.close();
        server.unref();
      });
      server.on('error', (e) => reject(e));
      server.on('close', () => resolve(port));
    } catch (e) {
      reject(e);
    }
  });
}

async function loadCachedCredentials(client: OAuth2Client): Promise<boolean> {
  const pathsToTry = [
    Storage.getOAuthCredsPath(),
    process.env['GOOGLE_APPLICATION_CREDENTIALS'],
  ].filter((p): p is string => !!p);

  for (const keyFile of pathsToTry) {
    try {
      const creds = await fs.readFile(keyFile, 'utf-8');
      client.setCredentials(JSON.parse(creds));

      // This will verify locally that the credentials look good.
      const { token } = await client.getAccessToken();
      if (!token) {
        continue;
      }

      // This will check with the server to see if it hasn't been revoked.
      await client.getTokenInfo(token);

      return true;
    } catch (error) {
      // Log specific error for debugging, but continue trying other paths
      console.debug(
        `Failed to load credentials from ${keyFile}:`,
        getErrorMessage(error),
      );
    }
  }

  return false;
}

async function cacheCredentials(credentials: Credentials) {
  const filePath = Storage.getOAuthCredsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const credString = JSON.stringify(credentials, null, 2);
  await fs.writeFile(filePath, credString, { mode: 0o600 });
  try {
    await fs.chmod(filePath, 0o600);
  } catch {
    /* empty */
  }
}

export function clearOauthClientCache() {
  oauthClientPromises.clear();
}

export async function clearCachedCredentialFile() {
  try {
    await fs.rm(Storage.getOAuthCredsPath(), { force: true });
    // Clear the Google Account ID cache when credentials are cleared
    await userAccountManager.clearCachedGoogleAccount();
    // Clear the in-memory OAuth client cache to force re-authentication
    clearOauthClientCache();
  } catch (e) {
    console.error('Failed to clear cached credentials:', e);
  }
}

async function fetchAndCacheUserInfo(client: OAuth2Client): Promise<void> {
  try {
    const { token } = await client.getAccessToken();
    if (!token) {
      return;
    }

    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      console.error(
        'Failed to fetch user info:',
        response.status,
        response.statusText,
      );
      return;
    }

    const userInfo = await response.json();
    await userAccountManager.cacheGoogleAccount(userInfo.email);
  } catch (error) {
    console.error('Error retrieving user info:', error);
  }
}

// Helper to ensure test isolation
export function resetOauthClientForTesting() {
  oauthClientPromises.clear();
}
