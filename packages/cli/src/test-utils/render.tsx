/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import type React from 'react';
import { KeypressProvider } from '../ui/contexts/KeypressContext.js';
import { ShellFocusContext } from '../ui/contexts/ShellFocusContext.js';

export const renderWithProviders = (
  component: React.ReactElement,
  { shellFocus = true } = {},
): ReturnType<typeof render> =>
  render(
    <ShellFocusContext.Provider value={shellFocus}>
      <KeypressProvider kittyProtocolEnabled={true}>
        {component}
      </KeypressProvider>
    </ShellFocusContext.Provider>,
  );
