/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAuth, AuthClient } from 'google-auth-library';
import { ContentGenerator } from '../core/contentGenerator.js';
import { getOauthClient } from './oauth2.js';
import { setupUser } from './setup.js';
import { CodeAssistServer, HttpOptions } from './server.js';

export async function createCodeAssistContentGenerator(
  httpOptions: HttpOptions,
): Promise<ContentGenerator> {
  const authClient = await getAuthClient();
  const projectId = await setupUser(authClient);
  return new CodeAssistServer(authClient, projectId, httpOptions);
}

async function getAuthClient(): Promise<AuthClient> {
  try {
    // Try for Application Default Credentials.
    return await new GoogleAuth().getClient();
  } catch (_) {
    // No Application Default Credentials so try Oauth.
    return await getOauthClient();
  }
}
