/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { KeypressProvider } from '../ui/contexts/KeypressContext.js';
import { SettingsContext } from '../ui/contexts/SettingsContext.js';
import { LoadedSettings } from '../config/settings.js';
import i18n from '../i18n/index.js';

export const renderWithProviders = (
  component: React.ReactElement,
  settings?: LoadedSettings,
): ReturnType<typeof render> =>
  render(
    <I18nextProvider i18n={i18n}>
      <KeypressProvider kittyProtocolEnabled={true}>
        <SettingsContext.Provider
          value={{ settings: settings!, recomputeSettings: () => {} }}
        >
          {component}
        </SettingsContext.Provider>
      </KeypressProvider>
    </I18nextProvider>,
  );
