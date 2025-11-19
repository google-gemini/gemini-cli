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
import { Banner } from './Banner.js';
import { theme } from '../semantic-colors.js';
import { Colors } from '../colors.js';
import { persistentState } from '../../utils/persistentState.js';
import { useState, useEffect, useRef } from 'react';

interface AppHeaderProps {
  version: string;
}

function hasVersionPrefix(str: string) {
  const versionPrefixRegex = /^v\d+:/; // starts with lowercase v followed by a number followed by a colon
  return versionPrefixRegex.test(str);
}

export const AppHeader = ({ version }: AppHeaderProps) => {
  const settings = useSettings();
  const config = useConfig();
  const { nightly, mainAreaWidth, bannerData, bannerVisible } = useUIState();

  const { defaultText, warningText } = bannerData;

  const [bannerCounts] = useState(
    () => persistentState.get('defaultBannerShownCount') || {},
  );

  let currentBannerVersion;
  let defaultTextDelimited;
  if (hasVersionPrefix(defaultText)) {
    const defaultTextSplit = defaultText.split(':');
    currentBannerVersion = defaultTextSplit[0];
    defaultTextDelimited = defaultTextSplit.slice(1).join('').trim();
  } else {
    currentBannerVersion = 'v0';
    defaultTextDelimited = defaultText;
  }
  const currentBannerCount = bannerCounts[currentBannerVersion] || 0;

  const showDefaultBanner =
    warningText === '' &&
    !config.getPreviewFeatures() &&
    currentBannerCount < 5;

  const bannerText = showDefaultBanner ? defaultTextDelimited : warningText;
  const unescapedBannerText = bannerText.replace(/\\n/g, '\n');

  const defaultColor = Colors.AccentBlue;
  const fontColor = warningText === '' ? defaultColor : theme.status.warning;

  const lastIncrementedKey = useRef<string | null>(null);

  useEffect(() => {
    if (showDefaultBanner && defaultText) {
      if (lastIncrementedKey.current !== defaultText) {
        lastIncrementedKey.current = defaultText;

        const allCounts = persistentState.get('defaultBannerShownCount') || {};
        const current = allCounts[currentBannerVersion] || 0;

        persistentState.set('defaultBannerShownCount', {
          ...allCounts,
          [currentBannerVersion]: current + 1,
        });
      }
    }
  }, [showDefaultBanner, defaultText, currentBannerVersion]);

  return (
    <Box flexDirection="column">
      {!(settings.merged.ui?.hideBanner || config.getScreenReader()) && (
        <>
          <Header version={version} nightly={nightly} />
          {bannerVisible && unescapedBannerText && (
            <Banner
              width={mainAreaWidth}
              bannerText={unescapedBannerText}
              color={fontColor}
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
