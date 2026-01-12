/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { HookEventName } from '@google/gemini-cli-core';
import { theme } from '../../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from '../shared/DescriptiveRadioButtonSelect.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { HOOK_EVENTS } from './types.js';

interface EventSelectorProps {
  selectedEvent?: HookEventName;
  onSelect: (event: HookEventName) => void;
  onCancel: () => void;
  isFocused?: boolean;
}

export function EventSelector({
  selectedEvent,
  onSelect,
  onCancel,
  isFocused = true,
}: EventSelectorProps): React.JSX.Element {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onCancel();
      }
    },
    { isActive: isFocused },
  );

  const items = HOOK_EVENTS.map((item) => ({
    key: item.event,
    value: item.event,
    title: item.title,
    description: item.description,
  }));

  const initialIndex = selectedEvent
    ? HOOK_EVENTS.findIndex((item) => item.event === selectedEvent)
    : 0;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Step 1: Select Hook Event
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={theme.text.secondary}>
          Choose when your hook should execute:
        </Text>
      </Box>
      <DescriptiveRadioButtonSelect<HookEventName>
        items={items}
        initialIndex={initialIndex >= 0 ? initialIndex : 0}
        onSelect={onSelect}
        isFocused={isFocused}
        showNumbers={true}
        showScrollArrows={true}
        maxItemsToShow={8}
      />
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Enter to select, Esc to cancel)
        </Text>
      </Box>
    </Box>
  );
}
