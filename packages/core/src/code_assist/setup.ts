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
import { debugLogger } from '../utils/debugLogger.js';
import { persistentState } from '../utils/persistentState.js';

export class ProjectIdRequiredError extends Error {
  constructor() {
    super(
      'This account requires setting the GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID env var. See https://goo.gle/gemini-cli-auth-docs#workspace-gca',
    );
  }
}

export interface UserData {
  projectId: string;
  userTier: UserTierId;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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

  // Try to load from cache first
  const cached = persistentState.get('userTierCache');
  if (
    cached &&
    cached.projectId &&
    Date.now() - cached.timestamp <= CACHE_TTL_MS
  ) {
    // If a specific project ID is requested, ensure the cache matches
    if (!projectId || cached.projectId === projectId) {
      debugLogger.debug('Using cached user tier and project ID.');
      return {
        projectId: cached.projectId,
        userTier: cached.userTier,
      };
    }
  }

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
    let result: UserData;
    if (!loadRes.cloudaicompanionProject) {
      if (projectId) {
        result = {
          projectId,
          userTier: loadRes.currentTier.id,
        };
      } else {
        throw new ProjectIdRequiredError();
      }
    } else {
      result = {
        projectId: loadRes.cloudaicompanionProject,
        userTier: loadRes.currentTier.id,
      };
    }
    // Cache the result
    persistentState.set('userTierCache', {
      ...result,
      timestamp: Date.now(),
    });
    return result;
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
      const result = {
        projectId,
        userTier: tier.id,
      };
      persistentState.set('userTierCache', {
        ...result,
        timestamp: Date.now(),
      });
      return result;
    }
    throw new ProjectIdRequiredError();
  }

  const finalResult = {
    projectId: lroRes.response.cloudaicompanionProject.id,
    userTier: tier.id,
  };
  persistentState.set('userTierCache', {
    ...finalResult,
    timestamp: Date.now(),
  });
  return finalResult;
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
