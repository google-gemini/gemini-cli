/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OAuth2Client } from 'google-auth-library';

import { ClientMetadata } from './metadata.js';
import { doLoadCodeAssist, LoadCodeAssistResponse } from './load.js';
import { doGCALogin } from './login.js';
import {
  doOnboardUser,
  LongrunningOperationResponse,
  OnboardUserRequest,
} from './onboard.js';

export async function doSetup(): Promise<string> {
  const oauth2Client: OAuth2Client = await doGCALogin();
  const clientMetadata: ClientMetadata = {
    ideType: 'IDE_UNSPECIFIED',
    ideVersion: null,
    pluginVersion: null,
    platform: 'PLATFORM_UNSPECIFIED',
    updateChannel: null,
    duetProject: 'aipp-internal-testing',
    pluginType: 'GEMINI',
    ideName: null,
  };

  // Call LoadCodeAssist.
  const loadCodeAssistRes: LoadCodeAssistResponse = await doLoadCodeAssist(
    {
      cloudaicompanionProject: 'aipp-internal-testing',
      metadata: clientMetadata,
    },
    oauth2Client,
  );

  // Call OnboardUser until long running operation is complete.
  const onboardUserReq: OnboardUserRequest = {
    tierId: 'legacy-tier',
    cloudaicompanionProject: loadCodeAssistRes.cloudaicompanionProject || '',
    metadata: clientMetadata,
  };
  let lroRes: LongrunningOperationResponse = await doOnboardUser(
    onboardUserReq,
    oauth2Client,
  );
  while (!lroRes.done) {
    await new Promise((f) => setTimeout(f, 5000));
    lroRes = await doOnboardUser(onboardUserReq, oauth2Client);
  }

  return lroRes.response?.cloudaicompanionProject?.id || '';
}
