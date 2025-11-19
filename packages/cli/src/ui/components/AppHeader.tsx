/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { Header } from './Header.js';
import { Tips } from './Tips.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { Banner } from './Banner.js';
import { theme } from '../semantic-colors.js';
import { Colors } from '../colors.js';
import { persistentState } from '../../utils/persistentState.js';
import { ThemedGradient } from './ThemedGradient.js';
import { useEffect, useRef, useState, type ReactNode } from 'react';

function getFormattedBannerContent(
  rawText: string,
  isWarning: boolean,
  subsequentLineColor: string,
): ReactNode {
  if (isWarning) {
    return (
      <Text color={theme.status.warning}>{rawText.replace(/\\n/g, '\n')}</Text>
    );
  }

  const lines = rawText.split('\\n');

  if (lines.length <= 1) {
    return (
      <ThemedGradient>
        <Text>{rawText.replace(/\\n/g, '\n')}</Text>
      </ThemedGradient>
    );
  }

  return lines.map((line, index) => {
    if (index === 0) {
      return (
        <ThemedGradient key={index}>
          <Text>{line}</Text>
        </ThemedGradient>
      );
    }

    return (
      <Text key={index} color={subsequentLineColor}>
        {line}
      </Text>
    );
  });
}

interface AppHeaderProps {
  version: string;
}

export const AppHeader = ({ version }: AppHeaderProps) => {
  const settings = useSettings();
  const config = useConfig();
  const { nightly, mainAreaWidth, bannerData, bannerVisible } = useUIState();

  const [defaultBannerShownCount] = useState(
    () => persistentState.get('defaultBannerShownCount') || 0,
  );

  const { defaultText, warningText } = bannerData;

  const showDefaultBanner =
    warningText === '' &&
    !config.getPreviewFeatures() &&
    defaultBannerShownCount < 5;

  const bannerText = showDefaultBanner ? defaultText : warningText;
  const isWarning = warningText !== '';

  const subsequentLineColor = theme.text.primary;

  const formattedBannerContent = getFormattedBannerContent(
    bannerText,
    isWarning,
    subsequentLineColor,
  );

  const hasIncrementedRef = useRef(false);
  useEffect(() => {
    if (showDefaultBanner && defaultText && !hasIncrementedRef.current) {
      hasIncrementedRef.current = true;
      const current = persistentState.get('defaultBannerShownCount') || 0;
      persistentState.set('defaultBannerShownCount', current + 1);
    }
  }, [showDefaultBanner, defaultText]);

  return (
    <Box flexDirection="column">
      {!(settings.merged.ui?.hideBanner || config.getScreenReader()) && (
        <>
          <Header version={version} nightly={nightly} />
          {bannerVisible && bannerText && (
            <Banner
              width={mainAreaWidth}
              bannerText={formattedBannerContent}
              color={isWarning ? theme.status.warning : Colors.Gray}
            />
          )}
        </>
      )}
      {!(settings.merged.ui?.hideTips || config.getScreenReader()) && (
        <Tips config={config} />
      )}
    </Box>
  );
};
