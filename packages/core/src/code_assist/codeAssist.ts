/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContentGenerator } from '../core/contentGenerator.js';
import { getOauthClient } from './oauth2.js';
import { setupUser } from './setup.js';
import { CodeAssistServer, HttpOptions } from './server.js';

export async function createCodeAssistContentGenerator(
  httpOptions: HttpOptions,
): Promise<ContentGenerator> {
  const authClient = await getOauthClient();
  const projectId = await setupUser(authClient);
  return new CodeAssistServer(authClient, projectId, httpOptions);
}
