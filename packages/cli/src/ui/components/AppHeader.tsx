/**
 * @license
 * Copyright 2026 Google LLC
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

import { isAppleTerminal } from '@google/gemini-cli-core';
import { compactLogoIcon, longAsciiLogoCompactText } from './AsciiArt.js';
import { getAsciiArtWidth } from '../utils/textUtils.js';

interface AppHeaderProps {
  version: string;
  showDetails?: boolean;
}

const DEFAULT_ICON = `▝▜▄  
  ▝▜▄
 ▗▟▀ 
▝▀    `;

const MAC_TERMINAL_ICON = `▝▜▄  
  ▝▜▄
  ▗▟▀
▗▟▀  `;

export const AppHeader = ({ version, showDetails = true }: AppHeaderProps) => {
  const settings = useSettings();
  const config = useConfig();
  const { terminalWidth, bannerData, bannerVisible, updateInfo } = useUIState();

  const { bannerText } = useBanner(bannerData);
  const { showTips } = useTips();

  const authType = config.getContentGeneratorConfig()?.authType;
  const loggedOut = !authType;

  const showHeader = !(
    settings.merged.ui.hideBanner || config.getScreenReader()
  );

  const ICON = isAppleTerminal() ? MAC_TERMINAL_ICON : DEFAULT_ICON;

  // Determine if we should show the full landing banner
  let showFullLogo = false;
  if (loggedOut && terminalWidth > 0) {
    try {
      const widthOfLongLogo = getAsciiArtWidth(longAsciiLogoCompactText) + 10;
      if (terminalWidth >= widthOfLongLogo) {
        showFullLogo = true;
      }
    } catch {
      showFullLogo = false;
    }
  }

  const identitySection = showDetails && (
    <>
      <Box height={1} />
      {settings.merged.ui.showUserIdentity !== false && (
        <UserIdentity config={config} />
      )}
    </>
  );

  const versionLine = (
    <Box>
      <Text bold color={theme.text.primary}>
        Gemini CLI
      </Text>
      <Text color={theme.text.secondary}> v{version}</Text>
      {showDetails && updateInfo && (
        <Box marginLeft={2}>
          <Text color={theme.text.secondary}>
            <CliSpinner /> Updating
          </Text>
        </Box>
      )}
    </Box>
  );

  const renderHeader = () => {
    if (!showHeader) return null;

    if (showFullLogo) {
      return (
        <Box
          flexDirection="column"
          marginTop={1}
          marginBottom={1}
          paddingLeft={2}
        >
          <Box flexDirection="row" flexShrink={0} marginBottom={1}>
            <ThemedGradient>{compactLogoIcon.trim()}</ThemedGradient>
            <Box marginLeft={2}>
              <Text color={theme.text.primary}>
                {longAsciiLogoCompactText.trim()}
              </Text>
            </Box>
          </Box>
          <Box flexDirection="column">
            {versionLine}
            {identitySection}
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="row" marginTop={1} marginBottom={1} paddingLeft={2}>
        <Box flexShrink={0}>
          <ThemedGradient>{ICON}</ThemedGradient>
        </Box>
        <Box marginLeft={2} flexDirection="column">
          {versionLine}
          {identitySection}
        </Box>
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      {renderHeader()}

      {showDetails && bannerVisible && bannerText && (
        <Banner
          width={terminalWidth}
          bannerText={bannerText}
          isWarning={bannerData.warningText !== ''}
        />
      )}

      {showDetails &&
        !(settings.merged.ui.hideTips || config.getScreenReader()) &&
        showTips && <Tips config={config} />}
    </Box>
  );
};
