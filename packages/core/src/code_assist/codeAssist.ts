/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, ContentGenerator } from '../core/contentGenerator.js';
import { getOauthClient } from './oauth2.js';
import { setupUser } from './setup.js';
import { CodeAssistServer, HttpOptions } from './server.js';
import { Config } from '../config/config.js';

export async function createCodeAssistContentGenerator(
  httpOptions: HttpOptions,
  authType: AuthType,
  config: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.CLOUD_SHELL
  ) {
    const authClient = await getOauthClient(authType, config);
    const userData = await setupUser(authClient);
    return new CodeAssistServer(
      authClient,
      userData.projectId,
      httpOptions,
      sessionId,
      userData.userTier,
    );
  }

  throw new Error(`Unsupported authType: ${authType}`);
}
