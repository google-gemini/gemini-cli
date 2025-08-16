/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import path from 'path';

const { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET } = process.env;

if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
  throw new Error(
    'Missing OAUTH_CLIENT_ID or OAUTH_CLIENT_SECRET environment variables.',
  );
}

const secretsFilePath = path.resolve(
  process.cwd(),
  'packages/core/src/code_assist/oauth2_secrets.ts',
);

const content = `/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// This file is a placeholder for OAuth2 secrets.
// During the release process, this file will be overwritten with the actual
// client ID and secret.

export const OAUTH_CLIENT_ID = '${OAUTH_CLIENT_ID}';
export const OAUTH_CLIENT_SECRET = '${OAUTH_CLIENT_SECRET}';
`;

async function injectSecrets() {
  try {
    await fs.writeFile(secretsFilePath, content, 'utf8');
    console.log('Successfully injected OAuth2 secrets.');
  } catch (error) {
    console.error('Failed to inject OAuth2 secrets:', error);
    process.exit(1);
  }
}

injectSecrets();
