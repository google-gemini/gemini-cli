/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import React from 'react';
import { KeypressProvider } from '../ui/contexts/KeypressContext.js';

export const renderWithProviders = (
  component: React.ReactElement,
): ReturnType<typeof render> =>
  render(
    <KeypressProvider kittyProtocolEnabled={true}>
      {component}
    </KeypressProvider>,
  );
