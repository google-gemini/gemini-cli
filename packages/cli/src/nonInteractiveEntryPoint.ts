/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { runNonInteractive } from './nonInteractiveCli.js';
import type { Config, ResumedSessionData } from '@google/gemini-cli-core';
import type { LoadedSettings } from './config/settings.js';

export async function runNonInteractiveEntryPoint(
  config: Config,
  settings: LoadedSettings,
  resumedSessionData?: ResumedSessionData,
) {
  await runNonInteractive({
    config,
    settings,
    resumedSessionData,
  });
}
