/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { useState } from 'react';
import { Header } from './Header.js';
import { Tips } from './Tips.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { Banner } from './Banner.js';
import type { Flag } from '@google/gemini-cli-core/src/code_assist/experiments/types.js';
import { theme } from '../semantic-colors.js';
import { Colors } from '../colors.js';

interface AppHeaderProps {
  version: string;
}

export const AppHeader = ({ version }: AppHeaderProps) => {
  const settings = useSettings();
  const config = useConfig();
  const { nightly, mainAreaWidth } = useUIState();
  const [flags] = useState<Record<string, Flag>>(() => {
    const initial = config.getExperiments();
    return initial?.flags ?? {};
  });

  const defaultText =
    flags['GeminiCLIBannerText__no_capacity_issues']?.stringValue ?? '';
  const warningText =
    flags['GeminiCLIBannerText__capacity_issues']?.stringValue ?? '';

  const showDefaultBanner = warningText === '' && !config.getPreviewFeatures();
  const bannerText = showDefaultBanner ? defaultText : warningText;

  const defaultColor = Colors.AccentBlue;
  const fontColor = warningText === '' ? defaultColor : theme.status.warning;

  return (
    <Box flexDirection="column">
      {!(settings.merged.ui?.hideBanner || config.getScreenReader()) && (
        <>
          <Header version={version} nightly={nightly} />
          {bannerText && (
            <Banner
              width={mainAreaWidth}
              bannerText={bannerText}
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
