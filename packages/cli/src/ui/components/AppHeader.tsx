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
import { useBanner } from '../hooks/useBanner.js';

interface AppHeaderProps {
  version: string;
}

export const AppHeader = ({ version }: AppHeaderProps) => {
  const settings = useSettings();
  const config = useConfig();
  const { nightly, mainAreaWidth, bannerData, bannerVisible } = useUIState();

  const { bannerText } = useBanner(bannerData, config);

  return (
    <Box flexDirection="column">
      {!(settings.merged.ui.hideBanner || config.getScreenReader()) && (
        <>
          <Header version={version} nightly={nightly} />
          {bannerVisible && bannerText && (
            <Banner
              width={mainAreaWidth}
              bannerText={bannerText}
              isWarning={bannerData.warningText !== ''}
            />
          )}
        </>
      )}
      {!(settings.merged.ui.hideTips || config.getScreenReader()) && (
        <Tips config={config} />
      )}
    </Box>
  );
};
