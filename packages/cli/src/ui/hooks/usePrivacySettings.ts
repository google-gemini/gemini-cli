/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Config,
  CodeAssistServer,
  UserTierId,
  LoggingContentGenerator,
} from '@google/gemini-cli-core';

export interface PrivacyState {
  isLoading: boolean;
  error?: string;
  isFreeTier?: boolean;
  dataCollectionOptIn?: boolean;
}

export const usePrivacySettings = (config: Config) => {
  const [privacyState, setPrivacyState] = useState<PrivacyState>({
    isLoading: true,
  });

  useEffect(() => {
    const fetchInitialState = async () => {
      setPrivacyState({
        isLoading: true,
      });
      try {
        const server = getCodeAssistServer(config);
        const tier = await getTier(server);
        if (tier !== UserTierId.FREE) {
          // We don't need to fetch opt-out info since non-free tier
          // data gathering is already worked out some other way.
          setPrivacyState({
            isLoading: false,
            isFreeTier: false,
          });
          return;
        }

        const optIn = await getRemoteDataCollectionOptIn(server);
        setPrivacyState({
          isLoading: false,
          isFreeTier: true,
          dataCollectionOptIn: optIn,
        });
      } catch (e) {
        setPrivacyState({
          isLoading: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    };
    fetchInitialState();
  }, [config]);

  const updateDataCollectionOptIn = useCallback(
    async (optIn: boolean) => {
      try {
        const server = getCodeAssistServer(config);
        const updatedOptIn = await setRemoteDataCollectionOptIn(server, optIn);
        setPrivacyState({
          isLoading: false,
          isFreeTier: true,
          dataCollectionOptIn: updatedOptIn,
        });
      } catch (e) {
        setPrivacyState({
          isLoading: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [config],
  );

  return {
    privacyState,
    updateDataCollectionOptIn,
  };
};

function getCodeAssistServer(config: Config): CodeAssistServer {
  let server = config.getGeminiClient().getContentGenerator();

  // Unwrap LoggingContentGenerator if present
  if (server instanceof LoggingContentGenerator) {
    server = server.getWrapped();
  }

  // Neither of these cases should ever happen.
  if (!(server instanceof CodeAssistServer)) {
    throw new Error('Oauth not being used');
  } else if (!server.projectId) {
    throw new Error('Oauth not being used');
  }
  return server;
}

async function getTier(server: CodeAssistServer): Promise<UserTierId> {
  const loadRes = await server.loadCodeAssist({
    cloudaicompanionProject: server.projectId,
    metadata: {
      ideType: 'IDE_UNSPECIFIED',
      platform: 'PLATFORM_UNSPECIFIED',
      pluginType: 'GEMINI',
      duetProject: server.projectId,
    },
  });
  if (!loadRes.currentTier) {
    throw new Error('User does not have a current tier');
  }
  return loadRes.currentTier.id;
}

async function getRemoteDataCollectionOptIn(
  server: CodeAssistServer,
): Promise<boolean> {
  try {
    const resp = await server.getCodeAssistGlobalUserSetting();
    return resp.freeTierDataCollectionOptin;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const gaxiosError = error as {
        response?: {
          status?: unknown;
        };
      };
      if (gaxiosError.response?.status === 404) {
        return true;
      }
    }
    throw error;
  }
}

async function setRemoteDataCollectionOptIn(
  server: CodeAssistServer,
  optIn: boolean,
): Promise<boolean> {
  const resp = await server.setCodeAssistGlobalUserSetting({
    cloudaicompanionProject: server.projectId,
    freeTierDataCollectionOptin: optIn,
  });
  return resp.freeTierDataCollectionOptin;
}
