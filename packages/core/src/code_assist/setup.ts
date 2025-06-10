/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientMetadata, OnboardUserRequest } from './types.js';
import { CcpaServer } from './ccpaServer.js';
import { OAuth2Client } from 'google-auth-library';

/**
 *
 * @param projectId the user's project id, if any
 * @returns the user's actual project id
 */
export async function setupUser(
  oAuth2Client: OAuth2Client,
  projectId?: string,
): Promise<string> {
  const ccpaServer: CcpaServer = new CcpaServer(oAuth2Client, projectId);
  const clientMetadata: ClientMetadata = {
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
  };
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    clientMetadata.duetProject = process.env.GOOGLE_CLOUD_PROJECT;
  }

  // TODO: Support Free Tier user without projectId.
  const loadRes = await ccpaServer.loadCodeAssist({
    cloudaicompanionProject: process.env.GOOGLE_CLOUD_PROJECT,
    metadata: clientMetadata,
  });

  const onboardReq: OnboardUserRequest = {
    tierId: 'legacy-tier',
    cloudaicompanionProject: loadRes.cloudaicompanionProject || '',
    metadata: clientMetadata,
  };

  // Poll onboardUser until long running operation is complete.
  let lroRes = await ccpaServer.onboardUser(onboardReq);
  while (!lroRes.done) {
    await new Promise((f) => setTimeout(f, 5000));
    lroRes = await ccpaServer.onboardUser(onboardReq);
  }

  return lroRes.response?.cloudaicompanionProject?.id || '';
}
