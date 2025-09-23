/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useUIState } from './contexts/UIStateContext.js';
import { StreamingContext } from './contexts/StreamingContext.js';
import { QuittingDisplay } from './components/QuittingDisplay.js';
import { useLayoutConfig } from './hooks/useLayoutConfig.js';
import { ScreenReaderAppLayout } from './layouts/ScreenReaderAppLayout.js';
import { DefaultAppLayout } from './layouts/DefaultAppLayout.js';

export const App = () => {
  const uiState = useUIState();
  const layout = useLayoutConfig();

  if (uiState.quittingMessages) {
    return <QuittingDisplay />;
  }

  return (
    <StreamingContext.Provider value={uiState.streamingState}>
      {layout.mode === 'screenReader' ? (
        <ScreenReaderAppLayout />
      ) : (
        <DefaultAppLayout />
      )}
    </StreamingContext.Provider>
  );
};
