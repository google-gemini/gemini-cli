/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientMetadata, OnboardUserRequest } from './types.js';
import { CcpaServer } from './ccpaServer.js';
import { OAuth2Client } from 'google-auth-library';
import { GaxiosError } from 'gaxios';
import { clearCachedCredentials } from './oauth2.js';

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
  try {
    // Poll onboardUser until long running operation is complete.
    let lroRes = await ccpaServer.onboardUser(onboardReq);
    while (!lroRes.done) {
      await new Promise((f) => setTimeout(f, 5000));
      lroRes = await ccpaServer.onboardUser(onboardReq);
    }

    return lroRes.response?.cloudaicompanionProject?.id || '';
  } catch (e) {
    if (e instanceof GaxiosError) {
      const detail = e.response?.data?.error?.details[0].detail;
      if (detail && detail.includes('projectID is empty')) {
        await clearCachedCredentials();
        console.log(
          '\n\nEnterprise users must specify GOOGLE_CLOUD_PROJECT ' +
            'in your environment variables or .env file.\n\n',
        );
        process.exit(1);
      }
    }
    throw e;
  }
}
