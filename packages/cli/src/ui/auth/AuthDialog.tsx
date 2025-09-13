/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import {
  AuthType,
  clearCachedCredentialFile,
  type Config,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { AuthState } from '../types.js';
import { runExitCleanup } from '../../utils/cleanup.js';
import { validateAuthMethodWithSettings } from './useAuth.js';
import { useTranslation } from '../../i18n/useTranslation.js';

interface AuthDialogProps {
  config: Config;
  settings: LoadedSettings;
  setAuthState: (state: AuthState) => void;
  authError: string | null;
  onAuthError: (error: string) => void;
}

export function AuthDialog({
  config,
  settings,
  setAuthState,
  authError,
  onAuthError,
}: AuthDialogProps): React.JSX.Element {
  const { t } = useTranslation('dialogs');

  let items = [
    {
      label: t('auth.options.google'),
      value: AuthType.LOGIN_WITH_GOOGLE,
    },
    ...(process.env['CLOUD_SHELL'] === 'true'
      ? [
          {
            label: t('auth.options.cloudShell'),
            value: AuthType.CLOUD_SHELL,
          },
        ]
      : []),
    {
      label: t('auth.options.geminiKey'),
      value: AuthType.USE_GEMINI,
    },
    { label: t('auth.options.vertexAI'), value: AuthType.USE_VERTEX_AI },
  ];

  if (settings.merged.security?.auth?.enforcedType) {
    items = items.filter(
      (item) => item.value === settings.merged.security?.auth?.enforcedType,
    );
  }

  let defaultAuthType = null;
  const defaultAuthTypeEnv = process.env['GEMINI_DEFAULT_AUTH_TYPE'];
  if (
    defaultAuthTypeEnv &&
    Object.values(AuthType).includes(defaultAuthTypeEnv as AuthType)
  ) {
    defaultAuthType = defaultAuthTypeEnv as AuthType;
  }

  let initialAuthIndex = items.findIndex((item) => {
    if (settings.merged.security?.auth?.selectedType) {
      return item.value === settings.merged.security.auth.selectedType;
    }

    if (defaultAuthType) {
      return item.value === defaultAuthType;
    }

    if (process.env['GEMINI_API_KEY']) {
      return item.value === AuthType.USE_GEMINI;
    }

    return item.value === AuthType.LOGIN_WITH_GOOGLE;
  });
  if (settings.merged.security?.auth?.enforcedType) {
    initialAuthIndex = 0;
  }

  const onSelect = useCallback(
    async (authType: AuthType | undefined, scope: SettingScope) => {
      if (authType) {
        await clearCachedCredentialFile();

        settings.setValue(scope, 'security.auth.selectedType', authType);
        if (
          authType === AuthType.LOGIN_WITH_GOOGLE &&
          config.isBrowserLaunchSuppressed()
        ) {
          runExitCleanup();
          console.log(
            `
----------------------------------------------------------------
Logging in with Google... Please restart Gemini CLI to continue.
----------------------------------------------------------------
            `,
          );
          process.exit(0);
        }
      }
      setAuthState(AuthState.Unauthenticated);
    },
    [settings, config, setAuthState],
  );

  const handleAuthSelect = (authMethod: AuthType) => {
    const error = validateAuthMethodWithSettings(authMethod, settings);
    if (error) {
      onAuthError(error);
    } else {
      onSelect(authMethod, SettingScope.User);
    }
  };

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        // Prevent exit if there is an error message.
        // This means they user is not authenticated yet.
        if (authError) {
          return;
        }
        if (settings.merged.security?.auth?.selectedType === undefined) {
          // Prevent exiting if no auth method is set
          onAuthError(t('auth.errors.authRequired'));
          return;
        }
        onSelect(undefined, SettingScope.User);
      }
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={theme.text.primary}>
        {t('auth.title')}
      </Text>
      <Box marginTop={1}>
        <Text color={theme.text.primary}>{t('auth.description')}</Text>
      </Box>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          initialIndex={initialAuthIndex}
          onSelect={handleAuthSelect}
        />
      </Box>
      {authError && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{authError}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>{t('auth.instructions')}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.text.primary}>{t('auth.terms')}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.text.link}>{t('auth.termsUrl')}</Text>
      </Box>
    </Box>
  );
}
