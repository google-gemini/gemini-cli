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

export const AppHeader = ({ version }: AppHeaderProps) => {
  const settings = useSettings();
  const config = useConfig();
  const { nightly, mainAreaWidth, bannerData, bannerVisible } = useUIState();

  const { defaultText, warningText } = bannerData;

  const [bannerCounts] = useState(
    () => persistentState.get('bannerCounts') || {},
  );

  const currentBannerCount = bannerCounts[defaultText] || 0;

  const showDefaultBanner =
    warningText === '' &&
    !config.getPreviewFeatures() &&
    currentBannerCount < 5;

  const bannerText = showDefaultBanner ? defaultText : warningText;
  const unescapedBannerText = bannerText.replace(/\\n/g, '\n');

  const defaultColor = Colors.AccentBlue;
  const fontColor = warningText === '' ? defaultColor : theme.status.warning;

  const lastIncrementedKey = useRef<string | null>(null);

  useEffect(() => {
    if (showDefaultBanner && defaultText) {
      if (lastIncrementedKey.current !== defaultText) {
        lastIncrementedKey.current = defaultText;

        const allCounts = persistentState.get('bannerCounts') || {};
        const current = allCounts[defaultText] || 0;

        persistentState.set('bannerCounts', {
          ...allCounts,
          [defaultText]: current + 1,
        });
      }
    }
  }, [showDefaultBanner, defaultText]);

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
