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

  const [defaultBannerShownCount] = useState(
    () => persistentState.get('defaultBannerShownCount') || 0,
  );

  const { defaultText, warningText } = bannerData;

  const showDefaultBanner =
    warningText === '' &&
    !config.getPreviewFeatures() &&
    defaultBannerShownCount < 5;
  const bannerText = showDefaultBanner ? defaultText : warningText;
  const unescapedBannerText = bannerText.replace(/\\n/g, '\n');

  const defaultColor = Colors.AccentBlue;
  const fontColor = warningText === '' ? defaultColor : theme.status.warning;

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
