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
  debugLogger,
} from '@google/gemini-cli-core';

export interface PrivacyState {
  isLoading: boolean;
  error?: string;
  isFreeTier?: boolean;
  dataCollectionOptIn?: boolean;
  /**
   * True when the signed-in account has no consumer Code Assist tier, so the
   * data-collection opt-in isn't applicable (e.g. Workspace/enterprise accounts,
   * or an OAuth login without a Google Cloud project). This is an expected state
   * rendered as a friendly, actionable notice rather than a raw backend `error`.
   */
  isTierUnavailable?: boolean;
}

/**
 * Signals that the current account can't be mapped to a consumer Code Assist
 * tier, so the privacy opt-in can't be shown. Handled by rendering a friendly
 * notice instead of surfacing a raw backend error.
 */
class TierUnavailableError extends Error {}

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
          // The account has no resolved Code Assist tier (e.g. Workspace or an
          // incomplete OAuth). Show a friendly notice instead of a raw error.
          setPrivacyState({
            isLoading: false,
            isTierUnavailable: true,
          });
          return;
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
        if (isTierUnavailableError(e)) {
          setPrivacyState({
            isLoading: false,
            isTierUnavailable: true,
          });
          return;
        }
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
        if (isTierUnavailableError(e)) {
          setPrivacyState({
            isLoading: false,
            isTierUnavailable: true,
          });
          return;
        }
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
    throw new TierUnavailableError('Oauth not being used');
  } else if (server.projectId === undefined) {
    throw new TierUnavailableError('CodeAssist server is missing a project ID');
  }
  return server;
}

/**
 * Determines whether an error means the account simply has no consumer Code
 * Assist tier, as opposed to an unexpected failure. Covers the local
 * {@link TierUnavailableError} as well as the Code Assist backend error (e.g.
 * "User does not have a current tier") returned for Workspace/enterprise
 * accounts.
 */
function isTierUnavailableError(error: unknown): boolean {
  if (error instanceof TierUnavailableError) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  // Match the specific Code Assist backend message rather than a broad substring
  // so an unrelated error that merely mentions "tier" isn't masked as a benign notice.
  return /does not have a current tier/i.test(message);
}

async function getRemoteDataCollectionOptIn(
  server: CodeAssistServer,
): Promise<boolean> {
  try {
    const resp = await server.getCodeAssistGlobalUserSetting();
    if (resp.freeTierDataCollectionOptin === undefined) {
      debugLogger.warn(
        'Warning: Code Assist API did not return freeTierDataCollectionOptin. Defaulting to true.',
      );
    }
    return resp.freeTierDataCollectionOptin ?? true;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
  if (resp.freeTierDataCollectionOptin === undefined) {
    debugLogger.warn(
      `Warning: Code Assist API did not return freeTierDataCollectionOptin. Defaulting to ${optIn}.`,
    );
  }
  return resp.freeTierDataCollectionOptin ?? optIn;
}
