/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContentGenerator } from '../core/contentGenerator.js';
import { getOauthClient } from './oauth2.js';
import { setupUser } from './setup.js';
import { CodeAssistServer } from './server.js';

export async function createCodeAssistContentGenerator(): Promise<ContentGenerator> {
  const oauth2Client = await getOauthClient();
  const projectId = await setupUser(
    oauth2Client,
    process.env.GOOGLE_CLOUD_PROJECT,
  );
  return new CodeAssistServer(oauth2Client, projectId);
}
