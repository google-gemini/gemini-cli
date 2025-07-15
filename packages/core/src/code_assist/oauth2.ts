/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  OAuth2Client,
  Credentials,
  Compute,
  CodeChallengeMethod,
} from 'google-auth-library';
import * as http from 'http';
import url from 'url';
import crypto from 'crypto';
import * as net from 'net';
import open from 'open';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import * as os from 'os';
import { Config } from '../config/config.js';
import { getErrorMessage } from '../utils/errors.js';
import {
  cacheGoogleAccount,
  getCachedGoogleAccount,
  clearCachedGoogleAccount,
} from '../utils/user_account.js';
import { AuthType } from '../core/contentGenerator.js';
import readline from 'node:readline';

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

const GEMINI_DIR = '.gemini';
const CREDENTIAL_FILENAME = 'oauth_creds.json';

/**
 * An Authentication URL for updating the credentials of a Oauth2Client
 * as well as a promise that will resolve when the credentials have
 * been refreshed (or which throws error when refreshing credentials failed).
 */
export interface OauthWebLogin {
  authUrl: string;
  loginCompletePromise: Promise<void>;
}

export async function getOauthClient(
  authType: AuthType,
  config: Config,
): Promise<OAuth2Client> {
  const client = new OAuth2Client({
    clientId: OAUTH_CLIENT_ID,
    clientSecret: OAUTH_CLIENT_SECRET,
  });

  client.on('tokens', async (tokens: Credentials) => {
    await cacheCredentials(tokens);
  });

  // If there are cached creds on disk, they always take precedence
  if (await loadCachedCredentials(client)) {
    // Found valid cached credentials.
    // Check if we need to retrieve Google Account ID or Email
    if (!getCachedGoogleAccount()) {
      try {
        await fetchAndCacheUserInfo(client);
      } catch {
        // Non-fatal, continue with existing auth.
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

  if (config.getNoBrowser()) {
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
      process.exit(1);
    }
  } else {
    const webLogin = await authWithWeb(client);

    // This does basically nothing, as it isn't show to the user.
    console.log(
      `\n\nCode Assist login required.\n` +
        `Attempting to open authentication page in your browser.\n` +
        `Otherwise navigate to:\n\n${webLogin.authUrl}\n\n`,
    );
    await open(webLogin.authUrl);
    console.log('Waiting for authentication...');

    await webLogin.loginCompletePromise;
  }

  return client;
}

async function authWithUserCode(client: OAuth2Client): Promise<boolean> {
  const redirectUri = 'https://sdk.cloud.google.com/authcode_cloudcode.html';
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
  } catch (_error) {
    return false;
  }
  return true;
}

async function authWithWeb(client: OAuth2Client): Promise<OauthWebLogin> {
  const port = await getAvailablePort();
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
          reject(new Error('Unexpected request: ' + req.url));
        }
        // acquire the code from the querystring, and close the web server.
        const qs = new url.URL(req.url!, 'http://localhost:3000').searchParams;
        if (qs.get('error')) {
          res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_FAILURE_URL });
          res.end();

          reject(new Error(`Error during authentication: ${qs.get('error')}`));
        } else if (qs.get('state') !== state) {
          res.end('State mismatch. Possible CSRF attack');

          reject(new Error('State mismatch. Possible CSRF attack'));
        } else if (qs.get('code')) {
          const { tokens } = await client.getToken({
            code: qs.get('code')!,
            redirect_uri: redirectUri,
          });
          client.setCredentials(tokens);
          // Retrieve and cache Google Account ID during authentication
          try {
            await fetchAndCacheUserInfo(client);
          } catch (error) {
            console.error(
              'Failed to retrieve Google Account ID during authentication:',
              error,
            );
            // Don't fail the auth flow if Google Account ID retrieval fails
          }

          res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_SUCCESS_URL });
          res.end();
          resolve();
        } else {
          reject(new Error('No code found in request'));
        }
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
    server.listen(port);
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
  try {
    const keyFile =
      process.env.GOOGLE_APPLICATION_CREDENTIALS || getCachedCredentialPath();

    const creds = await fs.readFile(keyFile, 'utf-8');
    client.setCredentials(JSON.parse(creds));

    // This will verify locally that the credentials look good.
    const { token } = await client.getAccessToken();
    if (!token) {
      return false;
    }

    // This will check with the server to see if it hasn't been revoked.
    await client.getTokenInfo(token);

    return true;
  } catch (_) {
    return false;
  }
}

async function cacheCredentials(credentials: Credentials) {
  const filePath = getCachedCredentialPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const credString = JSON.stringify(credentials, null, 2);
  await fs.writeFile(filePath, credString);
}

function getCachedCredentialPath(): string {
  return path.join(os.homedir(), GEMINI_DIR, CREDENTIAL_FILENAME);
}

export async function clearCachedCredentialFile() {
  try {
    await fs.rm(getCachedCredentialPath(), { force: true });
    // Clear the Google Account ID cache when credentials are cleared
    await clearCachedGoogleAccount();
  } catch (_) {
    /* empty */
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
    if (userInfo.email) {
      await cacheGoogleAccount(userInfo.email);
    }
  } catch (error) {
    console.error('Error retrieving user info:', error);
  }
}
