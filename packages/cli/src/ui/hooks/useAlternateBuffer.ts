/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConfig } from '../contexts/ConfigContext.js';
import type { Config } from '@google/gemini-cli-core';

export const isAlternateBufferEnabled = (config: Config): boolean =>
  config.getUseAlternateBuffer();

// This is read from Config so that the UI reads the same value per application session
export const useAlternateBuffer = (): boolean => {
  const config = useConfig();
  return isAlternateBufferEnabled(config);
};
