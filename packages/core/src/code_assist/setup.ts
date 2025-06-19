/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientMetadata, OnboardUserRequest } from './types.js';
import { CodeAssistServer } from './server.js';
import { OAuth2Client } from 'google-auth-library';

/**
 *
 * @param projectId the user's project id, if any
 * @returns the user's actual project id
 */
export async function setupUser(authClient: OAuth2Client): Promise<string> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const caServer = new CodeAssistServer(authClient, projectId);

  const clientMetadata: ClientMetadata = {
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
    duetProject: projectId,
  };

  // TODO: Support Free Tier user without projectId.
  const loadRes = await caServer.loadCodeAssist({
    cloudaicompanionProject: projectId,
    metadata: clientMetadata,
  });

  const onboardTier: string =
    loadRes.allowedTiers?.find((tier) => tier.isDefault)?.id ?? 'legacy-tier';

  const onboardReq: OnboardUserRequest = {
    tierId: onboardTier,
    cloudaicompanionProject: loadRes.cloudaicompanionProject || projectId || '',
    metadata: clientMetadata,
  };
  try {
    // Poll onboardUser until long running operation is complete.
    let lroRes = await caServer.onboardUser(onboardReq);
    while (!lroRes.done) {
      await new Promise((f) => setTimeout(f, 5000));
      lroRes = await caServer.onboardUser(onboardReq);
    }
    return lroRes.response?.cloudaicompanionProject?.id || '';
  } catch (e) {
    console.log(
      '\n\nError onboarding with Code Assist.\n' +
        'Google Workspace Account (e.g. your-name@your-company.com)' +
        ' must specify a GOOGLE_CLOUD_PROJECT environment variable.\n\n',
    );
    throw e;
  }
}
