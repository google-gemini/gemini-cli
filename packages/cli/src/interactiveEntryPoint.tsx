/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink';
import { AppContainer } from './ui/AppContainer.js';
import type { Config, ResumedSessionData } from '@google/gemini-cli-core';
import type { LoadedSettings } from './config/settings.js';

export async function runInteractiveEntryPoint(
  config: Config,
  settings: LoadedSettings,
  resumedSessionData?: ResumedSessionData,
) {
  render(
    <AppContainer
      config={config}
      settings={settings}
      resumedSessionData={resumedSessionData}
    />,
  );
}
