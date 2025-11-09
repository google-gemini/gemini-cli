/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { Header } from './Header.js';
import { Tips } from './Tips.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { WelcomeMessage } from './WelcomeMessage.js';
import { UserAccountManager } from '@google/gemini-cli-core';

interface AppHeaderProps {
  version: string;
}

export const AppHeader = ({ version }: AppHeaderProps) => {
  const settings = useSettings();
  const config = useConfig();
  const { nightly } = useUIState();
  const userAccountManager = new UserAccountManager();
  const cachedAccount = userAccountManager.getCachedGoogleAccount();
  const userTierName = config.getUserTierName();

  return (
    <Box flexDirection="column">
      {!(settings.merged.ui?.hideBanner || config.getScreenReader()) && (
        <Header version={version} nightly={nightly} />
      )}
      {!(settings.merged.ui?.hideTips || config.getScreenReader()) && (
        <Tips config={config} />
      )}
      {cachedAccount && userTierName && (
        <WelcomeMessage
          userName={cachedAccount.name}
          userEmail={cachedAccount.email}
          userTierName={userTierName}
        />
      )}
    </Box>
  );
};
