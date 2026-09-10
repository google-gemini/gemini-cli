/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { useUIState } from '../contexts/UIStateContext.js';
import { DialogManager } from '../components/DialogManager.js';
import { Notifications } from '../components/Notifications.js';
import { MainContent } from '../components/MainContent.js';
import { Composer } from '../components/Composer.js';
import { Footer } from '../components/Footer.js';
import { Banner } from '../components/Banner.js';

export const ScreenReaderAppLayout = () => {
  const uiState = useUIState();

  return (
    <Box flexDirection="column" width="100%">
      {uiState.dialogsVisible && <DialogManager />}
      <Banner />
      <Notifications />
      <MainContent />
      <Composer />
      <Footer />
    </Box>
  );
};
