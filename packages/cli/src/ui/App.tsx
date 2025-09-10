/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useUIState } from './contexts/UIStateContext.js';
import { QuittingDisplay } from './components/QuittingDisplay.js';
import { useScreenReaderLayout } from './layouts/useScreenReaderLayout.js';
import { ScreenReaderAppLayout } from './layouts/ScreenReaderAppLayout.js';
import { DefaultAppLayout } from './layouts/DefaultAppLayout.js';

export const App = () => {
  const uiState = useUIState();
  const layout = useScreenReaderLayout();

  if (uiState.quittingMessages) {
    return <QuittingDisplay />;
  }

  // Use appropriate layout based on screen reader mode
  if (layout.mode === 'screenReader') {
    return <ScreenReaderAppLayout />;
  }

  return <DefaultAppLayout />;
};
