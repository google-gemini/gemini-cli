/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, ContentGenerator } from '../core/contentGenerator.js';
import { logger } from '../core/logger.js';
import { GeminiClient } from '../core/client.js';
import { getOauthClient } from './oauth2.js';
import { setupUser } from './setup.js';
import { CodeAssistServer, HttpOptions } from './server.js';
import { UnsupportedAuthTypeError } from './errors.js';

export async function createCodeAssistContentGenerator(
  httpOptions: HttpOptions,
  authType: AuthType,
): Promise<ContentGenerator> {
  logger.info(`Attempting to create Code Assist Content Generator with auth type: ${authType}`);
  try {
    if (authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
      const authClient = await getOauthClient();
      const projectId = await setupUser(authClient);
      logger.info('Successfully created CodeAssistServer with Google Personal Auth.');
      return new CodeAssistServer(authClient, projectId, httpOptions);
    } else if (authType === AuthType.USE_GEMINI) {
      // Assuming GeminiClient can be initialized without explicit authClient for API Key
      // and uses GEMINI_API_KEY from environment variables internally.
      logger.info('Creating GeminiClient for API Key authentication.');
      return new GeminiClient(httpOptions);
    }

    throw new UnsupportedAuthTypeError(authType);
  } catch (error) {
    logger.error(`Failed to create Code Assist Content Generator: ${error.message}`, { error });
    throw error;
  }
}
