/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import {
  getLuminance,
  parseColor,
  shouldSwitchTheme,
} from '../themes/color-utils.js';
import { themeManager, DEFAULT_THEME } from '../themes/theme-manager.js';
import { DefaultLight } from '../themes/default-light.js';
import { useSettings } from '../contexts/SettingsContext.js';
import type { Config } from '@google/gemini-cli-core';
import { useTerminalContext } from '../contexts/TerminalContext.js';
import { SettingScope } from '../../config/settings.js';
import type { UIActions } from '../contexts/UIActionsContext.js';

export function useTerminalTheme(
  handleThemeSelect: UIActions['handleThemeSelect'],
  config: Config,
  refreshStatic: () => void,
) {
  const settings = useSettings();
  const { subscribe, unsubscribe, queryTerminalBackground } =
    useTerminalContext();

  useEffect(() => {
    if (settings.merged.ui.autoThemeSwitching === false) {
      return;
    }

    // Only poll for changes to the terminal background if a terminal background was detected at startup.
    if (config.getTerminalBackground() === undefined) {
      return;
    }

    const pollIntervalId = setInterval(() => {
      // Only poll if we are using one of the default themes
      const currentThemeName = settings.merged.ui.theme;
      if (!themeManager.isDefaultTheme(currentThemeName)) {
        return;
      }

      void queryTerminalBackground();
    }, settings.merged.ui.terminalBackgroundPollingInterval * 1000);

    const handleTerminalBackground = (colorStr: string) => {
      // Parse the response "rgb:rrrr/gggg/bbbb"
      const match =
        /^rgb:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})$/.exec(
          colorStr,
        );
      if (!match) return;

      const hexColor = parseColor(match[1], match[2], match[3]);
      if (!hexColor) return;

      const previousColor = config.getTerminalBackground();

      if (previousColor === hexColor) {
        return;
      }

      config.setTerminalBackground(hexColor);
      themeManager.setTerminalBackground(hexColor);

      const luminance = getLuminance(hexColor);
      const currentThemeName = settings.merged.ui.theme;

      const newTheme = shouldSwitchTheme(
        currentThemeName,
        luminance,
        DEFAULT_THEME.name,
        DefaultLight.name,
      );

      if (newTheme) {
        void handleThemeSelect(newTheme, SettingScope.User);
      } else {
        // The existing theme had its background changed so refresh because
        // there may be existing static UI rendered that relies on the old
        // background color.
        refreshStatic();
      }
    };

    subscribe(handleTerminalBackground);

    return () => {
      clearInterval(pollIntervalId);
      unsubscribe(handleTerminalBackground);
    };
  }, [
    settings.merged.ui.theme,
    settings.merged.ui.autoThemeSwitching,
    settings.merged.ui.terminalBackgroundPollingInterval,
    config,
    handleThemeSelect,
    subscribe,
    unsubscribe,
    queryTerminalBackground,
    refreshStatic,
  ]);
}
