/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box } from 'ink';
import { useUIState } from '../contexts/UIStateContext.js';
import { TopicDisplay } from './messages/TopicMessage.js';

export const TOPIC_STICKY_HEADER_HEIGHT = 2;

export const TopicStickyHeader: React.FC = () => {
  const { currentTopic } = useUIState();

  if (!currentTopic || (!currentTopic.title && !currentTopic.summary)) {
    return null;
  }

  return (
    <Box marginTop={1} flexDirection="column">
      <TopicDisplay
        title={currentTopic.title}
        summary={currentTopic.summary}
        marginLeft={2}
      />
    </Box>
  );
};
