/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useConfig } from '../contexts/ConfigContext.js';
import type { ScheduledItem } from '@google/gemini-cli-core';

/**
 * Displays all pending scheduled work items above the context summary.
 * Only renders when there are pending items.
 */
export const ScheduledWorkDisplay: React.FC = () => {
  const config = useConfig();
  const [items, setItems] = useState<readonly ScheduledItem[]>([]);

  useEffect(() => {
    const scheduler = config.getWorkScheduler();

    const update = () => {
      setItems(scheduler.getPendingItems());
    };

    scheduler.on('changed', update);
    update();

    return () => {
      scheduler.off('changed', update);
    };
  }, [config]);

  if (items.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={theme.text.secondary}>
        ⏰ Scheduled work ({items.length}):
      </Text>
      {items.map((item) => {
        const timeStr = item.fireAt.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        const diffMs = item.fireAt.getTime() - Date.now();
        const diffMins = Math.max(0, Math.ceil(diffMs / 60000));
        const truncatedPrompt =
          item.prompt.length > 60
            ? item.prompt.slice(0, 57) + '...'
            : item.prompt;
        return (
          <Text key={item.id} color={theme.text.secondary}>
            {'  '}
            {timeStr} (in {diffMins}m) — {truncatedPrompt}
          </Text>
        );
      })}
    </Box>
  );
};
