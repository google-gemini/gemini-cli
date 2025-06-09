/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OAuth2Client } from 'google-auth-library';

import { ClientMetadata } from './metadata.js';
import { DEFAULT_ENDPOINT } from './constants.js';

const ONBOARD_USER_ENDPOINT = '/v1internal:onboardUser';

export async function doOnboardUser(
  req: OnboardUserRequest,
  oauth2Client: OAuth2Client,
): Promise<LongrunningOperationResponse> {
  console.log('OnboardUser req: ', JSON.stringify(req));
  const authHeaders = await oauth2Client.getRequestHeaders();
  const headers = { 'Content-Type': 'application/json', ...authHeaders };
  const res: Response = await fetch(
    new URL(ONBOARD_USER_ENDPOINT, DEFAULT_ENDPOINT),
    {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
    },
  );
  const data: LongrunningOperationResponse =
    (await res.json()) as LongrunningOperationResponse;
  console.log('OnboardUser res: ', JSON.stringify(data));
  return data;
}

/**
 * Proto signature of OnboardUserRequest as payload to OnboardUser call
 */
export interface OnboardUserRequest {
  tierId: string | undefined;
  cloudaicompanionProject: string | undefined;
  metadata: ClientMetadata | undefined;
}

/**
 * Represents LongrunningOperation proto
 * http://google3/google/longrunning/operations.proto;rcl=698857719;l=107
 */
export interface LongrunningOperationResponse {
  name: string;
  done?: boolean;
  response?: OnboardUserResponse;
}

/**
 * Represents OnboardUserResponse proto
 * http://google3/google/internal/cloud/code/v1internal/cloudcode.proto;l=215
 */
export interface OnboardUserResponse {
  // tslint:disable-next-line:enforce-name-casing This is the name of the field in the proto.
  cloudaicompanionProject?: {
    id: string;
    name: string;
  };
}

/**
 * Status code of user license status
 * it does not stricly correspond to the proto
 * Error value is an additional value assigned to error responses from OnboardUser
 */
export enum OnboardUserStatusCode {
  Default = 'DEFAULT',
  Notice = 'NOTICE',
  Warning = 'WARNING',
  Error = 'ERROR',
}

/**
 * Status of user onboarded to gemini
 */
export interface OnboardUserStatus {
  statusCode: OnboardUserStatusCode;
  displayMessage: string;
  helpLink: HelpLinkUrl | undefined;
}

export interface HelpLinkUrl {
  description: string;
  url: string;
}
