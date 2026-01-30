/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { useStdout } from 'ink';
import { parseX11Rgb, getLuminance } from '../themes/color-utils.js';
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
) {
  const { stdout } = useStdout();
  const settings = useSettings();
  const { subscribe, unsubscribe } = useTerminalContext();

  useEffect(() => {
    const pollInterval = setInterval(() => {
      // Check if auto-switching is enabled
      if (settings.merged.ui.autoThemeSwitching === false) {
        return;
      }

      // Only poll if we are using one of the default themes
      const currentThemeName = settings.merged.ui.theme;
      if (!themeManager.isDefaultTheme(currentThemeName)) {
        return;
      }

      stdout.write('\x1b]11;?\x1b\\');
    }, 3000);

    const handleTerminalBackground = (colorStr: string) => {
      // Parse the response "rgb:rrrr/gggg/bbbb"
      const match =
        /^rgb:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})$/.exec(
          colorStr,
        );
      if (!match) return;

      const hexColor = parseX11Rgb(match[1], match[2], match[3]);
      const luminance = getLuminance(hexColor);
      config.setTerminalBackground(hexColor);

      // Check if we need to switch theme
      const currentThemeName = settings.merged.ui.theme;
      const isDefaultTheme =
        currentThemeName === DEFAULT_THEME.name ||
        currentThemeName === undefined;
      const isDefaultLightTheme = currentThemeName === DefaultLight.name;

      // Hysteresis thresholds to prevent flickering when the background color
      // is ambiguous (near the midpoint).
      const LIGHT_THEME_LUMINANCE_THRESHOLD = 140;
      const DARK_THEME_LUMINANCE_THRESHOLD = 110;

      if (luminance > LIGHT_THEME_LUMINANCE_THRESHOLD && isDefaultTheme) {
        handleThemeSelect(DefaultLight.name, SettingScope.User);
      } else if (
        luminance < DARK_THEME_LUMINANCE_THRESHOLD &&
        isDefaultLightTheme
      ) {
        handleThemeSelect(DEFAULT_THEME.name, SettingScope.User);
      }
    };

    subscribe(handleTerminalBackground);

    return () => {
      clearInterval(pollInterval);
      unsubscribe(handleTerminalBackground);
    };
  }, [
    settings.merged.ui.theme,
    settings.merged.ui.autoThemeSwitching,
    stdout,
    config,
    handleThemeSelect,
    subscribe,
    unsubscribe,
  ]);
}
