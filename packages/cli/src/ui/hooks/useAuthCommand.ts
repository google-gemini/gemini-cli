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
  const [pendingAuthSelection, setPendingAuthSelection] = useState<
    | {
        authType: AuthType;
        scope: SettingScope;
      }
    | undefined
  >(
    // If user already has a saved auth method, set it as pending for auto-authentication
    settings.merged.selectedAuthType
      ? { authType: settings.merged.selectedAuthType, scope: SettingScope.User }
      : undefined,
  );

  useEffect(() => {
    const authFlow = async () => {
      if (isAuthDialogOpen || !pendingAuthSelection) {
        return;
      }

      try {
        setIsAuthenticating(true);
        await config.refreshAuth(pendingAuthSelection.authType);
        settings.setValue(
          pendingAuthSelection.scope,
          'selectedAuthType',
          pendingAuthSelection.authType,
        );
        console.log(`Authenticated via "${pendingAuthSelection.authType}".`);
      } catch (e) {
        setAuthError(`Failed to login. Message: ${getErrorMessage(e)}`);
        openAuthDialog();
      } finally {
        setIsAuthenticating(false);
        setPendingAuthSelection(undefined);
      }
    };

    void authFlow();
  }, [
    isAuthDialogOpen,
    pendingAuthSelection,
    settings,
    config,
    setAuthError,
    openAuthDialog,
  ]);

  const handleAuthSelect = useCallback(
    async (authType: AuthType | undefined, scope: SettingScope) => {
      if (authType) {
        await clearCachedCredentialFile();
        setPendingAuthSelection({ authType, scope });
      }
      setIsAuthDialogOpen(false);
      setAuthError(null);
    },
    [setAuthError],
  );

  const cancelAuthentication = useCallback(() => {
    setIsAuthenticating(false);
    setPendingAuthSelection(undefined);
  }, []);

  return {
    isAuthDialogOpen,
    openAuthDialog,
    handleAuthSelect,
    isAuthenticating,
    cancelAuthentication,
  };
};
