/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { parseColor } from '../themes/color-utils.js';
import { themeManager } from '../themes/theme-manager.js';
import { useSettings } from '../contexts/SettingsContext.js';
import type { Config } from '@google/gemini-cli-core';
import { useTerminalContext } from '../contexts/TerminalContext.js';
import type { UIActions } from '../contexts/UIActionsContext.js';
import { getActiveThemeName } from '../../utils/terminalTheme.js';

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

      const activeThemeName = getActiveThemeName(
        settings.merged,
        hexColor,
        config.getCliTheme(),
        config.getCliThemeMode(),
      );

      themeManager.setActiveTheme(activeThemeName);
      refreshStatic();
    };

    subscribe(handleTerminalBackground);

    return () => {
      clearInterval(pollIntervalId);
      unsubscribe(handleTerminalBackground);
    };
  }, [
    settings.merged,
    config,
    handleThemeSelect,
    subscribe,
    unsubscribe,
    queryTerminalBackground,
    refreshStatic,
  ]);
}
