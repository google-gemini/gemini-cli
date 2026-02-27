/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConfig } from '../contexts/ConfigContext.js';
import type { Config, TerminalCapabilities } from '@google/gemini-cli-core';
import {
  detectTerminalEnvironment,
  getTerminalCapabilities,
} from '@google/gemini-cli-core';
import { useTerminalCapabilities } from './useTerminalCapabilities.js';

/**
 * Returns true if the alternate buffer should be used according to config
 * and terminal capabilities.
 */
export const isAlternateBufferEnabled = (
  config: Config,
  capabilities?: TerminalCapabilities,
): boolean => {
  const caps =
    capabilities ??
    getTerminalCapabilities(detectTerminalEnvironment(), process.env, {
      forceAltBuffer: config.getSettings().merged.ui.compatibility?.forceAltBuffer,
      disableAltBuffer: config.getSettings().merged.ui.compatibility?.disableAltBuffer,
      disableMouse: config.getSettings().merged.ui.compatibility?.disableMouse,
      assumeTrustedTerminal:
        config.getSettings().merged.ui.compatibility?.assumeTrustedTerminal,
    }).capabilities;

  return config.getUseAlternateBuffer() && caps.supportsAltBuffer;
};

/**
 * Hook to determine if the alternate buffer is enabled.
 */
export const useAlternateBuffer = (): boolean => {
  const config = useConfig();
  const capabilities = useTerminalCapabilities();
  return isAlternateBufferEnabled(config, capabilities);
};
