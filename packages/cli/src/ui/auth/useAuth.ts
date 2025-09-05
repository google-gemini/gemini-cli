/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import type { LoadedSettings } from '../../config/settings.js';
import { AuthType, type Config } from '@google/gemini-cli-core';
import { getErrorMessage } from '@google/gemini-cli-core';
import { AuthState } from '../types.js';
import { validateAuthMethod } from '../../config/auth.js';

export function validateAuthMethodWithSettings(
  authType: AuthType,
  settings: LoadedSettings,
): string | null {
  const enforcedType = settings.merged.security?.auth?.enforcedType;
  if (enforcedType && enforcedType !== authType) {
    return `Authentication is enforced to be ${enforcedType}, but you are currently using ${authType}.`;
  }
  if (settings.merged.security?.auth?.useExternal) {
    return null;
  }
  return validateAuthMethod(authType);
}

export const useAuthCommand = (settings: LoadedSettings, config: Config) => {
  const [authState, setAuthState] = useState<AuthState>(
    AuthState.Unauthenticated,
  );

  const [authError, setAuthError] = useState<string | null>(null);

  const onAuthError = useCallback(
    (error: string) => {
      setAuthError(error);
      setAuthState(AuthState.Updating);
    },
    [setAuthError, setAuthState],
  );

  useEffect(() => {
    (async () => {
      if (authState !== AuthState.Unauthenticated) {
        return;
      }

      const authType = settings.merged.security?.auth?.selectedType;
      if (!authType) {
        if (process.env['GEMINI_API_KEY']) {
          onAuthError(
            'Existing API key detected (GEMINI_API_KEY). Select "Gemini API Key" option to use it.',
          );
        } else {
          onAuthError('No authentication method selected.');
        }
        return;
      }
      const error = validateAuthMethodWithSettings(authType, settings);
      if (error) {
        onAuthError(error);
        return;
      }

      const defaultAuthType = process.env['GEMINI_DEFAULT_AUTH_TYPE'];
      if (
        defaultAuthType &&
        !Object.values(AuthType).includes(defaultAuthType as AuthType)
      ) {
        onAuthError(
          `Invalid value for GEMINI_DEFAULT_AUTH_TYPE: "${defaultAuthType}". ` +
            `Valid values are: ${Object.values(AuthType).join(', ')}.`,
        );
        return;
      }

      try {
        await config.refreshAuth(authType);

        console.log(`Authenticated via "${authType}".`);
        setAuthError(null);
        setAuthState(AuthState.Authenticated);
      } catch (e) {
        onAuthError(`Failed to login. Message: ${getErrorMessage(e)}`);
      }
    })();
  }, [settings, config, authState, setAuthState, setAuthError, onAuthError]);

  return {
    authState,
    setAuthState,
    authError,
    onAuthError,
  };
};
