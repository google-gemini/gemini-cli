/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ClientMetadata,
  GeminiUserTier,
  LoadCodeAssistResponse,
  OnboardUserRequest,
} from './types.js';
import { UserTierId, IneligibleTierReasonCode } from './types.js';
import { CodeAssistServer } from './server.js';
import type { AuthClient } from 'google-auth-library';
import type { ValidationHandler } from '../fallback/types.js';
import { ChangeAuthRequestedError } from '../utils/errors.js';
import { ValidationRequiredError } from '../utils/googleQuotaErrors.js';

export class ProjectIdRequiredError extends Error {
  constructor() {
    super(
      'This account requires setting the GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID env var. See https://goo.gle/gemini-cli-auth-docs#workspace-gca',
    );
  }
}

/**
 * Error thrown when user cancels the validation process.
 * This is a non-recoverable error that should result in auth failure.
 */
export class ValidationCancelledError extends Error {
  constructor() {
    super('User cancelled account validation');
  }
}

export interface UserData {
  projectId: string;
  userTier: UserTierId;
  userTierName?: string;
}

/**
 *
 * @param projectId the user's project id, if any
 * @returns the user's actual project id
 */
export async function setupUser(
  client: AuthClient,
  validationHandler?: ValidationHandler,
): Promise<UserData> {
  const projectId =
    process.env['GOOGLE_CLOUD_PROJECT'] ||
    process.env['GOOGLE_CLOUD_PROJECT_ID'] ||
    undefined;
  const caServer = new CodeAssistServer(
    client,
    projectId,
    {},
    '',
    undefined,
    undefined,
  );
  const coreClientMetadata: ClientMetadata = {
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
  };

  let loadRes: LoadCodeAssistResponse;
  while (true) {
    loadRes = await caServer.loadCodeAssist({
      cloudaicompanionProject: projectId,
      metadata: {
        ...coreClientMetadata,
        duetProject: projectId,
      },
    });

    try {
      validateLoadCodeAssistResponse(loadRes);
      break;
    } catch (e) {
      if (e instanceof ValidationRequiredError && validationHandler) {
        const intent = await validationHandler(
          e.validationLink,
          e.validationDescription,
        );
        if (intent === 'verify') {
          continue;
        }
        if (intent === 'change_auth') {
          throw new ChangeAuthRequestedError();
        }
        throw new ValidationCancelledError();
      }
      throw e;
    }
  }

  if (loadRes.currentTier) {
    if (!loadRes.cloudaicompanionProject) {
      if (projectId) {
        return {
          projectId,
          userTier: loadRes.currentTier.id,
          userTierName: loadRes.currentTier.name,
        };
      }
      throw new ProjectIdRequiredError();
    }
    return {
      projectId: loadRes.cloudaicompanionProject,
      userTier: loadRes.currentTier.id,
      userTierName: loadRes.currentTier.name,
    };
  }

  const tier = getOnboardTier(loadRes);

  let onboardReq: OnboardUserRequest;
  if (tier.id === UserTierId.FREE) {
    // The free tier uses a managed google cloud project. Setting a project in the `onboardUser` request causes a `Precondition Failed` error.
    onboardReq = {
      tierId: tier.id,
      cloudaicompanionProject: undefined,
      metadata: coreClientMetadata,
    };
  } else {
    onboardReq = {
      tierId: tier.id,
      cloudaicompanionProject: projectId,
      metadata: {
        ...coreClientMetadata,
        duetProject: projectId,
      },
    };
  }

  let lroRes = await caServer.onboardUser(onboardReq);
  if (!lroRes.done && lroRes.name) {
    const operationName = lroRes.name;
    while (!lroRes.done) {
      await new Promise((f) => setTimeout(f, 5000));
      lroRes = await caServer.getOperation(operationName);
    }
  }

  if (!lroRes.response?.cloudaicompanionProject?.id) {
    if (projectId) {
      return {
        projectId,
        userTier: tier.id,
        userTierName: tier.name,
      };
    }
    throw new ProjectIdRequiredError();
  }

  return {
    projectId: lroRes.response.cloudaicompanionProject.id,
    userTier: tier.id,
    userTierName: tier.name,
  };
}

function getOnboardTier(res: LoadCodeAssistResponse): GeminiUserTier {
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

function validateLoadCodeAssistResponse(res: LoadCodeAssistResponse): void {
  if (!res) {
    throw new Error('LoadCodeAssist returned empty response');
  }
  if (
    !res.currentTier &&
    res.ineligibleTiers &&
    res.ineligibleTiers.length > 0
  ) {
    // Check for VALIDATION_REQUIRED first - this is a recoverable state
    const validationTier = res.ineligibleTiers.find(
      (t) =>
        t.validationUrl &&
        t.reasonCode === IneligibleTierReasonCode.VALIDATION_REQUIRED,
    );
    const validationUrl = validationTier?.validationUrl;
    if (validationTier && validationUrl) {
      throw new ValidationRequiredError(
        `Account validation required: ${validationTier.reasonMessage}`,
        undefined,
        validationUrl,
        validationTier.reasonMessage,
      );
    }

    // For other ineligibility reasons, throw a generic error
    const reasons = res.ineligibleTiers.map((t) => t.reasonMessage).join(', ');
    throw new Error(reasons);
  }
}
