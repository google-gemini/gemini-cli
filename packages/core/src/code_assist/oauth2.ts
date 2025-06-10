/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OAuth2Client } from 'google-auth-library';
import * as http from 'http';
import url from 'url';
import crypto from 'crypto';
import * as net from 'net';
import open from 'open';

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

export async function loginWithOauth(): Promise<OAuth2Client> {
  const port = await getAvailablePort();
  const oAuth2Client = new OAuth2Client({
    clientId: OAUTH_CLIENT_ID,
    clientSecret: OAUTH_CLIENT_SECRET,
    redirectUri: `http://localhost:${port}/oauth2callback`,
  });

  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(32).toString('hex');
    const authURL: string = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: OAUTH_SCOPE,
      state,
    });
    open(authURL);

    const server = http.createServer(async (req, res) => {
      try {
        if (req.url!.indexOf('/oauth2callback') === -1) {
          console.log('Unexpected request:', req.url);
          res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_FAILURE_URL });
          res.end();
          reject(new Error('Unexpected request: ' + req.url));
        }
        // acquire the code from the querystring, and close the web server.
        const qs = new url.URL(req.url!, 'http://localhost:3000').searchParams;
        console.log('Processing request:', qs);
        if (qs.get('error')) {
          res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_FAILURE_URL });
          res.end();
          reject(new Error(`Error during authentication: ${qs.get('error')}`));
        } else if (qs.get('state') !== state) {
          res.end('State mismatch. Possible CSRF attack');
          reject(new Error('State mismatch. Possible CSRF attack'));
        } else if (qs.get('code')) {
          const code: string = qs.get('code')!;
          console.log();
          const { tokens } = await oAuth2Client.getToken(code);
          console.log('Logged in! Tokens:\n\n', tokens);

          oAuth2Client.setCredentials(tokens);
          res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_SUCCESS_URL });
          res.end();
          resolve(oAuth2Client);
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
}

function getAvailablePort(): Promise<number> {
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
