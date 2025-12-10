/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import {
  type Config,
  type CodeAssistServer,
  UserTierId,
  getCodeAssistServer,
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
        const server = getCodeAssistServerOrFail(config);
        const tier = server.userTier;
        if (tier === undefined) {
          throw new Error('Could not determine user tier.');
        }
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
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    fetchInitialState();
  }, [config]);

  const updateDataCollectionOptIn = useCallback(
    async (optIn: boolean) => {
      try {
        const server = getCodeAssistServerOrFail(config);
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

function getCodeAssistServerOrFail(config: Config): CodeAssistServer {
  const server = getCodeAssistServer(config);
  if (server === undefined) {
    throw new Error('Oauth not being used');
  } else if (server.projectId === undefined) {
    throw new Error('CodeAssist server is missing a project ID');
  }
  return server;
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
