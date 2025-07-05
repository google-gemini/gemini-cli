/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import {
  AuthType,
  Config,
  clearCachedCredentialFile,
  getErrorMessage,
} from '@google/gemini-cli-core';

export const useAuthCommand = (
  settings: LoadedSettings,
  setAuthError: (error: string | null) => void,
  config: Config,
) => {
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(
    settings.merged.selectedAuthType === undefined,
  );

  const openAuthDialog = useCallback(() => {
    setIsAuthDialogOpen(true);
  }, []);

  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
  const authFlow = async () => {
    if (isAuthDialogOpen) {
      return; // Only check if the auth dialog is open.
    }

    try {
      setIsAuthenticating(true); // selectedAuthType is not nullable now
      await performAuthFlow(
        settings.merged.selectedAuthType,
        config,
      );
    } catch (e) {
      setAuthError(`Failed to login. Message: ${getErrorMessage(e)}`);
      openAuthDialog();
    } finally {
      setIsAuthenticating(false);
    }
  };

    void authFlow();
  }, [isAuthDialogOpen, settings, config, setAuthError, openAuthDialog]);

  const handleAuthSelect = useCallback(
    async (authType: AuthType | undefined, scope: SettingScope) => {
      if (authType) {
        await clearCachedCredentialFile();
        settings.setValue(scope, 'selectedAuthType', authType);
      }
      setIsAuthDialogOpen(false);
      setAuthError(null);
    },
    [settings, setAuthError],
  );

  const cancelAuthentication = useCallback(() => {
    setIsAuthenticating(false);
  }, []);

  return {
    isAuthDialogOpen,
    openAuthDialog,
    handleAuthSelect,
    isAuthenticating,
    cancelAuthentication,
  };
};
