/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { UserIdentity } from './UserIdentity.js';
import { Tips } from './Tips.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { Banner } from './Banner.js';
import { useBanner } from '../hooks/useBanner.js';
import { useTips } from '../hooks/useTips.js';
import { theme } from '../semantic-colors.js';
import { ThemedGradient } from './ThemedGradient.js';
import { CliSpinner } from './CliSpinner.js';

interface AppHeaderProps {
  version: string;
  showDetails?: boolean;
}

const ICON = `▝▜▄  
  ▝▜▄
 ▗▟▀ 
▝▀    `;

export const AppHeader = ({ version, showDetails = true }: AppHeaderProps) => {
  const settings = useSettings();
  const config = useConfig();
  const { terminalWidth, bannerData, bannerVisible, updateInfo } = useUIState();

  const { bannerText } = useBanner(bannerData);
  const { showTips } = useTips();

  const showHeader = !(
    settings.merged.ui.hideBanner || config.getScreenReader()
  );

  if (!showDetails) {
    return (
      <Box flexDirection="column">
        {showHeader && (
          <Box
            flexDirection="row"
            marginTop={1}
            marginBottom={1}
            paddingLeft={2}
          >
            <Box flexShrink={0}>
              <ThemedGradient>{ICON}</ThemedGradient>
            </Box>
            <Box marginLeft={2} flexDirection="column">
              <Box>
                <Text bold color={theme.text.primary}>
                  Gemini CLI
                </Text>
                <Text color={theme.text.secondary}> v{version}</Text>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {showHeader && (
        <Box flexDirection="row" marginTop={1} marginBottom={1} paddingLeft={2}>
          <Box flexShrink={0}>
            <ThemedGradient>{ICON}</ThemedGradient>
          </Box>
          <Box marginLeft={2} flexDirection="column">
            {/* Line 1: Gemini CLI vVersion [Updating] */}
            <Box>
              <Text bold color={theme.text.primary}>
                Gemini CLI
              </Text>
              <Text color={theme.text.secondary}> v{version}</Text>
              {updateInfo && (
                <Box marginLeft={2}>
                  <Text color={theme.text.secondary}>
                    <CliSpinner /> Updating
                  </Text>
                </Box>
              )}
            </Box>

            {/* Line 2: Blank */}
            <Box height={1} />

            {/* Lines 3 & 4: User Identity info (Email /auth and Plan /upgrade) */}
            <Box>
              {settings.merged.ui.showUserIdentity !== false && (
                <UserIdentity config={config} />
              )}
            </Box>
          </Box>
        </Box>
      )}

      {bannerVisible && bannerText && (
        <Banner
          width={terminalWidth}
          bannerText={bannerText}
          isWarning={bannerData.warningText !== ''}
        />
      )}

      {!(settings.merged.ui.hideTips || config.getScreenReader()) &&
        showTips && <Tips config={config} />}
    </Box>
  );
};
