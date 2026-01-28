/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useMemo } from 'react';
import { ChecklistItem, type ChecklistItemData } from './ChecklistItem.js';

export interface ChecklistProps {
  title: string;
  items: ChecklistItemData[];
  isExpanded: boolean;
  toggleHint?: string;
}

const ChecklistTitleDisplay: React.FC<{
  title: string;
  items: ChecklistItemData[];
  toggleHint?: string;
}> = ({ title, items, toggleHint }) => {
  const score = useMemo(() => {
    let total = 0;
    let completed = 0;
    for (const item of items) {
      if (item.status !== 'cancelled') {
        total += 1;
        if (item.status === 'completed') {
          completed += 1;
        }
      }
    }
    return `${completed}/${total} completed`;
  }, [items]);

  return (
    <Box flexDirection="row" columnGap={2} height={1}>
      <Text color={theme.text.primary} bold aria-label={`${title} list`}>
        {title}
      </Text>
      <Text color={theme.text.secondary}>
        {score}
        {toggleHint ? ` (${toggleHint})` : ''}
      </Text>
    </Box>
  );
};

const ChecklistListDisplay: React.FC<{ items: ChecklistItemData[] }> = ({
  items,
}) => (
  <Box flexDirection="column" aria-role="list">
    {items.map((item, index) => (
      <ChecklistItem
        item={item}
        key={`${index}-${item.label}`}
        role="listitem"
      />
    ))}
  </Box>
);

export const Checklist: React.FC<ChecklistProps> = ({
  title,
  items,
  isExpanded,
  toggleHint,
}) => {
  const inProgress: ChecklistItemData | null = useMemo(
    () => items.find((item) => item.status === 'in_progress') || null,
    [items],
  );

  const hasActiveItems = useMemo(
    () =>
      items.some(
        (item) => item.status === 'pending' || item.status === 'in_progress',
      ),
    [items],
  );

  if (items.length === 0 || (!isExpanded && !hasActiveItems)) {
    return null;
  }

  return (
    <Box
      borderStyle="single"
      borderBottom={false}
      borderRight={false}
      borderLeft={false}
      borderColor={theme.border.default}
      paddingLeft={1}
      paddingRight={1}
    >
      {isExpanded ? (
        <Box flexDirection="column" rowGap={1}>
          <ChecklistTitleDisplay
            title={title}
            items={items}
            toggleHint={toggleHint}
          />
          <ChecklistListDisplay items={items} />
        </Box>
      ) : (
        <Box flexDirection="row" columnGap={1} height={1}>
          <Box flexShrink={0} flexGrow={0}>
            <ChecklistTitleDisplay
              title={title}
              items={items}
              toggleHint={toggleHint}
            />
          </Box>
          {inProgress && (
            <Box flexShrink={1} flexGrow={1}>
              <ChecklistItem item={inProgress} wrap="truncate" />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
