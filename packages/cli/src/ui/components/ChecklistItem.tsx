/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { checkExhaustive } from '../../utils/checks.js';

export type ChecklistStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface ChecklistItemData {
  status: ChecklistStatus;
  label: string;
}

const ChecklistStatusDisplay: React.FC<{ status: ChecklistStatus }> = ({
  status,
}) => {
  switch (status) {
    case 'completed':
      return (
        <Text color={theme.status.success} aria-label="Completed">
          ✓
        </Text>
      );
    case 'in_progress':
      return (
        <Text color={theme.text.accent} aria-label="In Progress">
          »
        </Text>
      );
    case 'pending':
      return (
        <Text color={theme.text.secondary} aria-label="Pending">
          ☐
        </Text>
      );
    case 'cancelled':
      return (
        <Text color={theme.status.error} aria-label="Cancelled">
          ✗
        </Text>
      );
    default:
      checkExhaustive(status);
  }
};

export interface ChecklistItemProps {
  item: ChecklistItemData;
  wrap?: 'truncate';
  role?: 'listitem';
}

export const ChecklistItem: React.FC<ChecklistItemProps> = ({
  item,
  wrap,
  role: ariaRole,
}) => {
  const textColor = (() => {
    switch (item.status) {
      case 'in_progress':
        return theme.text.accent;
      case 'completed':
      case 'cancelled':
        return theme.text.secondary;
      case 'pending':
        return theme.text.primary;
      default:
        checkExhaustive(item.status);
    }
  })();
  const strikethrough = item.status === 'cancelled';

  return (
    <Box flexDirection="row" columnGap={1} aria-role={ariaRole}>
      <ChecklistStatusDisplay status={item.status} />
      <Box flexShrink={1}>
        <Text color={textColor} wrap={wrap} strikethrough={strikethrough}>
          {item.label}
        </Text>
      </Box>
    </Box>
  );
};
