/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ClientMetadata,
  GeminiUserTier,
  LoadCodeAssistResponse,
  OnboardUserRequest,
  UserTierId,
} from './types.js';
import { CodeAssistServer } from './server.js';
import { OAuth2Client } from 'google-auth-library';

export class ProjectIdRequiredError extends Error {
  constructor() {
    super(
      'This account requires setting the GOOGLE_CLOUD_PROJECT env var. See https://goo.gle/gemini-cli-auth-docs#workspace-gca',
    );
  }
}

/**
 *
 * @param projectId the user's project id, if any
 * @returns the user's actual project id
 */
export async function setupUser(client: OAuth2Client): Promise<string> {
  let projectId = process.env.GOOGLE_CLOUD_PROJECT || undefined;
  const caServer = new CodeAssistServer(client, projectId);

  const clientMetadata: ClientMetadata = {
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
    duetProject: projectId,
  };

  const loadRes = await caServer.loadCodeAssist({
    cloudaicompanionProject: projectId,
    metadata: clientMetadata,
  });

  if (!projectId && loadRes.cloudaicompanionProject) {
    projectId = loadRes.cloudaicompanionProject;
  }

  const tier = getOnboardTier(loadRes);
  if (tier.userDefinedCloudaicompanionProject && !projectId) {
    throw new ProjectIdRequiredError();
  }

  const onboardReq: OnboardUserRequest = {
    tierId: tier.id,
    cloudaicompanionProject: projectId,
    metadata: clientMetadata,
  };

  // Poll onboardUser until long running operation is complete.
  let lroRes = await caServer.onboardUser(onboardReq);
  while (!lroRes.done) {
    await new Promise((f) => setTimeout(f, 5000));
    lroRes = await caServer.onboardUser(onboardReq);
  }
  return lroRes.response?.cloudaicompanionProject?.id || '';
}

function getOnboardTier(res: LoadCodeAssistResponse): GeminiUserTier {
  if (res.currentTier) {
    return res.currentTier;
  }
  for (const tier of res.allowedTiers || []) {
    if (tier.isDefault) {
      return tier;
    }
  }
  return {
    name: '',
    description: '',
    id: UserTierId.LEGACY,
    userDefinedCloudaicompanionProject: true,
  };
}
