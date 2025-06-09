/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OAuth2Client } from 'google-auth-library';

import { ClientMetadata } from './metadata.js';
import { DEFAULT_ENDPOINT } from './constants.js';

const LOAD_CODE_ASSIST_ENDPOINT = '/v1internal:loadCodeAssist';

export async function doLoadCodeAssist(
  req: LoadCodeAssistRequest,
  oauth2Client: OAuth2Client,
): Promise<LoadCodeAssistResponse> {
  console.log('LoadCodeAssist req: ', JSON.stringify(req));
  const authHeaders = await oauth2Client.getRequestHeaders();
  const headers = { 'Content-Type': 'application/json', ...authHeaders };
  const res: Response = await fetch(
    new URL(LOAD_CODE_ASSIST_ENDPOINT, DEFAULT_ENDPOINT),
    {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
    },
  );
  const data: LoadCodeAssistResponse =
    (await res.json()) as LoadCodeAssistResponse;
  console.log('LoadCodeAssist res: ', JSON.stringify(data));
  return data;
}

export interface LoadCodeAssistRequest {
  cloudaicompanionProject?: string;
  metadata: ClientMetadata;
}

/**
 * Represents LoadCodeAssistResponse proto json field
 * http://google3/google/internal/cloud/code/v1internal/cloudcode.proto;l=224
 */
export interface LoadCodeAssistResponse {
  currentTier?: GeminiUserTier | null;
  allowedTiers?: GeminiUserTier[] | null;
  ineligibleTiers?: IneligibleTier[] | null;
  cloudaicompanionProject?: string | null;
}

/**
 * GeminiUserTier reflects the structure received from the CCPA when calling LoadCodeAssist.
 */
export interface GeminiUserTier {
  id: UserTierId;
  name: string;
  description: string;
  // This value is used to declare whether a given tier requires the user to configure the project setting on the IDE settings or not.
  userDefinedCloudaicompanionProject?: boolean | null;
  isDefault?: boolean;
  privacyNotice?: PrivacyNotice;
  hasAcceptedTos?: boolean;
  hasOnboardedPreviously?: boolean;
}

/**
 * List of predefined reason codes when a tier is blocked from a specific tier.
 * https://source.corp.google.com/piper///depot/google3/google/internal/cloud/code/v1internal/cloudcode.proto;l=378
 */
export enum IneligibleTierReasonCode {
  // go/keep-sorted start
  DASHER_USER = 'DASHER_USER',
  INELIGIBLE_ACCOUNT = 'INELIGIBLE_ACCOUNT',
  NON_USER_ACCOUNT = 'NON_USER_ACCOUNT',
  RESTRICTED_AGE = 'RESTRICTED_AGE',
  RESTRICTED_NETWORK = 'RESTRICTED_NETWORK',
  UNKNOWN = 'UNKNOWN',
  UNKNOWN_LOCATION = 'UNKNOWN_LOCATION',
  UNSUPPORTED_LOCATION = 'UNSUPPORTED_LOCATION',
  // go/keep-sorted end
}

/**
 * Includes information specifying the reasons for a user's ineligibility for a specific tier.
 * @param reasonCode mnemonic code representing the reason for in-eligibility.
 * @param reasonMessage message to display to the user.
 * @param tierId id of the tier.
 * @param tierName name of the tier.
 */
export interface IneligibleTier {
  reasonCode: IneligibleTierReasonCode;
  reasonMessage: string;
  tierId: UserTierId;
  tierName: string;
}

/**
 * UserTierId represents IDs returned from the Cloud Code Private API representing a user's tier
 *
 * //depot/google3/cloud/developer_experience/cloudcode/pa/service/usertier.go;l=16
 */
export enum UserTierId {
  FREE = 'free-tier',
  LEGACY = 'legacy-tier',
  STANDARD = 'standard-tier',
}

/**
 * PrivacyNotice reflects the structure received from the CCPA in regards to a tier
 * privacy notice.
 */
export interface PrivacyNotice {
  showNotice: boolean;
  noticeText?: string;
}
