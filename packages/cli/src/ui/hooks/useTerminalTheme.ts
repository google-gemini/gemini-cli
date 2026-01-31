/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { useStdout } from 'ink';
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
) {
  const { stdout } = useStdout();
  const settings = useSettings();
  const { subscribe, unsubscribe } = useTerminalContext();
  const unacknowledgedPolls = useRef(0);

  useEffect(() => {
    // Check if auto-switching is enabled
    if (settings.merged.ui.autoThemeSwitching === false) {
      return;
    }

    const pollIntervalId = setInterval(() => {
      // Only poll if we are using one of the default themes
      const currentThemeName = settings.merged.ui.theme;
      if (!themeManager.isDefaultTheme(currentThemeName)) {
        return;
      }

      // Stop polling if the terminal isn't responding
      if (unacknowledgedPolls.current >= 3) {
        clearInterval(pollIntervalId);
        return;
      }

      unacknowledgedPolls.current += 1;
      stdout.write('\x1b]11;?\x1b\\');
    }, settings.merged.ui.terminalBackgroundPollingInterval * 1000);

    const handleTerminalBackground = (colorStr: string) => {
      // Reset the counter since we got a response
      unacknowledgedPolls.current = 0;

      // Parse the response "rgb:rrrr/gggg/bbbb"
      const match =
        /^rgb:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})$/.exec(
          colorStr,
        );
      if (!match) return;

      const hexColor = parseColor(match[1], match[2], match[3]);
      const luminance = getLuminance(hexColor);
      config.setTerminalBackground(hexColor);

      const currentThemeName = settings.merged.ui.theme;

      const newTheme = shouldSwitchTheme(
        currentThemeName,
        luminance,
        DEFAULT_THEME.name,
        DefaultLight.name,
      );

      if (newTheme) {
        handleThemeSelect(newTheme, SettingScope.User);
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
    stdout,
    config,
    handleThemeSelect,
    subscribe,
    unsubscribe,
  ]);
}
