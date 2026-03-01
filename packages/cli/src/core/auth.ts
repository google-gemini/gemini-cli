/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type AuthType,
  type Config,
  getErrorMessage,
  ValidationRequiredError,
  isAccountSuspendedError,
} from '@google/gemini-cli-core';

import type { AccountSuspensionInfo } from '../ui/contexts/UIStateContext.js';

export interface InitialAuthResult {
  authError: string | null;
  accountSuspensionInfo: AccountSuspensionInfo | null;
}

/**
 * Handles the initial authentication flow.
 * @param config The application config.
 * @param authType The selected auth type.
 * @returns The auth result with error message and account suspension status.
 */
export async function performInitialAuth(
  config: Config,
  authType: AuthType | undefined,
): Promise<InitialAuthResult> {
  if (!authType) {
    return { authError: null, accountSuspensionInfo: null };
  }

  try {
    await config.refreshAuth(authType);
    // The console.log is intentionally left out here.
    // We can add a dedicated startup message later if needed.
  } catch (e) {
    if (e instanceof ValidationRequiredError) {
      // Don't treat validation required as a fatal auth error during startup.
      // This allows the React UI to load and show the ValidationDialog.
      return { authError: null, accountSuspensionInfo: null };
    }
    const suspendedError = isAccountSuspendedError(e);
    if (suspendedError) {
      return {
        authError: null,
        accountSuspensionInfo: {
          message: suspendedError.message,
          appealUrl: suspendedError.appealUrl,
          appealLinkText: suspendedError.appealLinkText,
        },
      };
    }
    return {
      authError: `Failed to login. Message: ${getErrorMessage(e)}`,
      accountSuspensionInfo: null,
    };
  }

  return { authError: null, accountSuspensionInfo: null };
}
