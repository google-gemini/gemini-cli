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
import { UserTierId } from './types.js';
import { CodeAssistServer } from './server.js';
import type { AuthClient } from 'google-auth-library';

export class ProjectIdRequiredError extends Error {
  constructor() {
    super(
      'This account requires setting the GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID env var. See https://goo.gle/gemini-cli-auth-docs#workspace-gca',
    );
  }
}

export class IneligibleTierError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface UserData {
  projectId: string;
  userTier: UserTierId;
}

/**
 *
 * @param projectId the user's project id, if any
 * @returns the user's actual project id
 */
export async function setupUser(client: AuthClient): Promise<UserData> {
  const projectId =
    process.env['GOOGLE_CLOUD_PROJECT'] ||
    process.env['GOOGLE_CLOUD_PROJECT_ID'] ||
    undefined;
  const caServer = new CodeAssistServer(client, projectId, {}, '', undefined);
  const coreClientMetadata: ClientMetadata = {
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
  };

  const loadRes = await caServer.loadCodeAssist({
    cloudaicompanionProject: projectId,
    metadata: {
      ...coreClientMetadata,
      duetProject: projectId,
    },
  });

  if (loadRes.currentTier) {
    if (!loadRes.cloudaicompanionProject) {
      handleMissingProjectId(loadRes, projectId);
      return {
        projectId: projectId!,
        userTier: loadRes.currentTier.id,
      };
    }
    return {
      projectId: loadRes.cloudaicompanionProject,
      userTier: loadRes.currentTier.id,
    };
  }

  // Since there was no tier let's try to onboard the user.
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
    handleMissingProjectId(loadRes, projectId);
    return {
      projectId: projectId!,
      userTier: tier.id,
    };
  }

  return {
    projectId: lroRes.response.cloudaicompanionProject.id,
    userTier: tier.id,
  };
}

function handleMissingProjectId(
  loadRes: LoadCodeAssistResponse,
  projectId?: string,
) {
  if (projectId) {
    return;
  }
  // Looks like the user is not eligible. check and print why they aren't eligible
  if (loadRes.ineligibleTiers?.[0]?.reasonMessage) {
    throw new IneligibleTierError(loadRes.ineligibleTiers[0].reasonMessage);
  }
  //If ineligibilty reason wasn't found print the default error recommending a ProjectId
  throw new ProjectIdRequiredError();
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
