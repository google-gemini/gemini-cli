/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box } from 'ink';
import { useUIState } from '../contexts/UIStateContext.js';
import { TopicDisplay } from './messages/TopicMessage.js';

import { theme } from '../semantic-colors.js';

export const TOPIC_STICKY_HEADER_HEIGHT = 2;

export const TopicStickyHeader: React.FC = () => {
  const { currentTopic, terminalWidth } = useUIState();

  if (!currentTopic || (!currentTopic.title && !currentTopic.summary)) {
    return null;
  }

  return (
    <Box flexDirection="column" width={terminalWidth}>
      <Box paddingY={0} paddingX={1} backgroundColor={theme.background.message}>
        <TopicDisplay
          title={currentTopic.title}
          summary={currentTopic.summary}
          marginLeft={1}
        />
      </Box>
      <Box
        width={terminalWidth}
        height={1}
        borderTop={true}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.ui.dark}
        borderStyle="single"
      />
    </Box>
  );
};
