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
import type { OAuth2Client } from 'google-auth-library';
import { AuthType } from '../core/contentGenerator.js';

export class ProjectIdRequiredError extends Error {
  constructor() {
    super(
      'This account requires setting the GOOGLE_CLOUD_PROJECT env var. See https://goo.gle/gemini-cli-auth-docs#workspace-gca',
    );
  }
}

export class ProjectAccessError extends Error {
  constructor(projectId: string, details?: string) {
    super(
      `Failed to access GCP project "${projectId}" for Gemini Code Assist.\n` +
        `${details || ''}\n` +
        `Please verify:\n` +
        `1. The project ID is correct\n` +
        `2. You have the necessary permissions for this project\n` +
        `3. The Gemini for Cloud API is enabled for this project\n` +
        `\n` +
        `To use a different project:\n` +
        `  export GOOGLE_CLOUD_PROJECT=<your-project-id>\n` +
        `\n` +
        `To use Free Tier instead, run /auth and select "Login with Google - Free Tier"`,
    );
  }
}

export class LicenseMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(
      `License type mismatch detected.\n` +
        `You selected: ${expected}\n` +
        `But the server returned: ${actual}\n` +
        `\n` +
        `This may indicate:\n` +
        `1. The project doesn't have a valid GCA license\n` +
        `2. You don't have access to the specified project\n` +
        `3. The project configuration is incorrect\n` +
        `\n` +
        `Please verify your project settings or contact your administrator.`,
    );
  }
}

export interface UserData {
  projectId: string;
  userTier: UserTierId;
}

/**
 *
 * @param client OAuth2 client
 * @param authType the authentication type being used
 * @returns the user's actual project id and tier
 */
export async function setupUser(
  client: OAuth2Client,
  authType: AuthType,
): Promise<UserData> {
  // Only use GOOGLE_CLOUD_PROJECT for GCA login or Cloud Shell
  const projectId =
    authType === AuthType.LOGIN_WITH_GOOGLE_GCA ||
    authType === AuthType.CLOUD_SHELL
      ? process.env['GOOGLE_CLOUD_PROJECT'] || undefined
      : undefined;
  const caServer = new CodeAssistServer(client, projectId, {}, '', undefined);
  const coreClientMetadata: ClientMetadata = {
    ideType: 'IDE_UNSPECIFIED',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
  };

  let loadRes: LoadCodeAssistResponse;
  try {
    loadRes = await caServer.loadCodeAssist({
      cloudaicompanionProject: projectId,
      metadata: {
        ...coreClientMetadata,
        duetProject: projectId,
      },
    });
  } catch (error) {
    // If GCA login failed with a project, throw a clear error
    if (authType === AuthType.LOGIN_WITH_GOOGLE_GCA && projectId) {
      throw new ProjectAccessError(
        projectId,
        error instanceof Error ? error.message : 'Authentication failed',
      );
    }
    throw error;
  }

  if (loadRes.currentTier) {
    // Check for license mismatch - GCA selected but Free Tier returned
    if (
      authType === AuthType.LOGIN_WITH_GOOGLE_GCA &&
      loadRes.currentTier.id === UserTierId.FREE
    ) {
      throw new LicenseMismatchError('Gemini Code Assist (GCA)', 'Free Tier');
    }

    if (!loadRes.cloudaicompanionProject) {
      if (projectId) {
        // GCA with project but no cloudaicompanionProject means project access issue
        if (authType === AuthType.LOGIN_WITH_GOOGLE_GCA) {
          throw new ProjectAccessError(
            projectId,
            'The project exists but is not configured for Gemini Code Assist',
          );
        }
        return {
          projectId,
          userTier: loadRes.currentTier.id,
        };
      }
      // For Free Tier login, don't require project ID
      if (authType === AuthType.LOGIN_WITH_GOOGLE) {
        return {
          projectId: '',
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

  // Check for license mismatch during onboarding
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE_GCA &&
    tier.id === UserTierId.FREE
  ) {
    throw new LicenseMismatchError('Gemini Code Assist (GCA)', 'Free Tier');
  }

  let onboardReq: OnboardUserRequest;
  if (tier.id === UserTierId.FREE || authType === AuthType.LOGIN_WITH_GOOGLE) {
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
      // GCA with project but onboarding didn't return a project
      if (authType === AuthType.LOGIN_WITH_GOOGLE_GCA) {
        throw new ProjectAccessError(
          projectId,
          'Failed to onboard to Gemini Code Assist with this project',
        );
      }
      return {
        projectId,
        userTier: tier.id,
      };
    }
    // For Free Tier login, don't require project ID
    if (authType === AuthType.LOGIN_WITH_GOOGLE) {
      return {
        projectId: '',
        userTier: tier.id,
      };
    }
    throw new ProjectIdRequiredError();
  }

  // Final validation: ensure GCA users don't get Free Tier
  const finalUserData = {
    projectId: lroRes.response.cloudaicompanionProject.id,
    userTier: tier.id,
  };

  if (
    authType === AuthType.LOGIN_WITH_GOOGLE_GCA &&
    finalUserData.userTier === UserTierId.FREE
  ) {
    throw new LicenseMismatchError('Gemini Code Assist (GCA)', 'Free Tier');
  }

  return finalUserData;
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
