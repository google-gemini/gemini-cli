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
  const compact = settings.merged.ui?.compact;

  const { bannerText } = useBanner(bannerData, config);

  const showHeader = !(
    settings.merged.ui?.hideBanner || config.getScreenReader()
  );
  const showTips = !(settings.merged.ui?.hideTips || config.getScreenReader());

  const headerContent = showHeader && (
    <Box flexDirection="column">
      <Header version={version} nightly={nightly} />
      {bannerVisible && bannerText && (
        <Banner
          width={mainAreaWidth}
          bannerText={bannerText}
          isWarning={bannerData.warningText !== ''}
        />
      )}
    </Box>
  );

  const tipsContent = showTips && <Tips config={config} />;

  return (
    <Box
      flexDirection={compact ? 'row' : 'column'}
      marginTop={compact ? 1 : 0}
      marginBottom={0}
    >
      {headerContent}
      {tipsContent && (
        <Box marginLeft={compact && showHeader ? 4 : 0}>{tipsContent}</Box>
      )}
    </Box>
  );
};
