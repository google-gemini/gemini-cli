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
      'Google Cloud Project ID Required\n\n' +
        'When using Google account authentication (GCA), you must set a Google Cloud Project ID.\n\n' +
        'Option 1: Set your project ID:\n' +
        '  export GOOGLE_CLOUD_PROJECT=your-project-id\n\n' +
        'Option 2: Switch to using an API key instead:\n' +
        '  1. Get an API key from https://aistudio.google.com/app/apikey\n' +
        '  2. export GEMINI_API_KEY=your-api-key\n\n' +
        'For more details see: https://goo.gle/gemini-cli-auth-docs#workspace-gca',
    );
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
      if (projectId) {
        return {
          projectId,
          userTier: loadRes.currentTier.id,
        };
      }
      throw new ProjectIdRequiredError();
    }
    return {
      projectId: loadRes.cloudaicompanionProject,
      userTier: loadRes.currentTier.id,
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

  // Poll onboardUser until long running operation is complete.
  let lroRes = await caServer.onboardUser(onboardReq);
  while (!lroRes.done) {
    await new Promise((f) => setTimeout(f, 5000));
    lroRes = await caServer.onboardUser(onboardReq);
  }

  if (!lroRes.response?.cloudaicompanionProject?.id) {
    if (projectId) {
      return {
        projectId,
        userTier: tier.id,
      };
    }
    throw new ProjectIdRequiredError();
  }

  return {
    projectId: lroRes.response.cloudaicompanionProject.id,
    userTier: tier.id,
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
