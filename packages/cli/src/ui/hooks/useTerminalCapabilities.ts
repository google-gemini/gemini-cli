/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import {
  detectTerminalEnvironment,
  getTerminalCapabilities,
  type TerminalCapabilities,
} from '@google/gemini-cli-core';
import { useSettings } from '../contexts/SettingsContext.js';

/**
 * Hook to access terminal capabilities based on detection and settings.
 */
export function useTerminalCapabilities(): TerminalCapabilities {
  const settings = useSettings();

  return useMemo(() => {
    const termEnv = detectTerminalEnvironment();
    const { capabilities } = getTerminalCapabilities(termEnv, process.env, {
      forceAltBuffer: settings.merged.ui.compatibility?.forceAltBuffer,
      disableAltBuffer: settings.merged.ui.compatibility?.disableAltBuffer,
      disableMouse: settings.merged.ui.compatibility?.disableMouse,
      assumeTrustedTerminal:
        settings.merged.ui.compatibility?.assumeTrustedTerminal,
    });
    return capabilities;
  }, [settings.merged.ui.compatibility]);
}
