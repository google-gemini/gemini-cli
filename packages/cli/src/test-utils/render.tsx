/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import React from 'react';
import { KeypressProvider } from '../ui/contexts/KeypressContext.js';
import { SettingsContext } from '../ui/contexts/SettingsContext.js';
import { LoadedSettings } from '../config/settings.js';

export const renderWithProviders = (
  component: React.ReactElement,
  settings?: LoadedSettings,
): ReturnType<typeof render> =>
  render(
    <KeypressProvider kittyProtocolEnabled={true}>
      <SettingsContext.Provider
        value={{ settings: settings!, recomputeSettings: () => {} }}
      >
        {component}
      </SettingsContext.Provider>
    </KeypressProvider>,
  );
