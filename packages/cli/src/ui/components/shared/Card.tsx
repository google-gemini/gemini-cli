/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { ToolStatusIndicator } from '../messages/ToolShared.js';
import { ToolCallStatus } from '../../types.js';
import { checkExhaustive } from '@google/gemini-cli-core';

/**
 * Props for the Card component.
 */
export interface CardProps {
  /** The main title of the card. */
  title: string;
  /** Optional text to display after the title (e.g., version, status). */
  suffix?: string;
  /** Optional indicator to display before the title. */
  showStatusIndicator?: boolean;
  /** The content to be displayed inside the card. */
  children?: React.ReactNode;
  /** The styling and intent of the card. */
  status?: ToolCallStatus;
  /** The width of the card. Defaults to 100%. */
  width?: string | number;
}

export const Card: React.FC<CardProps> = ({
  status = ToolCallStatus.Pending,
  title,
  showStatusIndicator = true,
  suffix,
  children,
  width = '100%',
}) => {
  const getColors = () => {
    switch (status) {
      case ToolCallStatus.Pending:
        return { border: theme.border.default, text: theme.text.accent };
      case ToolCallStatus.Confirming:
        return { border: theme.border.focused, text: theme.text.link };
      case ToolCallStatus.Error:
        return { border: theme.status.error, text: theme.status.error };
      case ToolCallStatus.Success:
        return { border: theme.border.default, text: theme.status.success };
      case ToolCallStatus.Canceled:
        return { border: theme.status.warning, text: theme.status.warning };
      case ToolCallStatus.Executing:
        return { border: theme.border.default, text: theme.status.success };
      default:
        checkExhaustive(status);
        return { border: theme.border.default, text: theme.text.primary };
    }
  };

  const colors = getColors();

  return (
    <Box flexDirection="column" width={width}>
      <Box width="100%" flexDirection="row">
        {/* Top border section */}
        <Box
          borderStyle="round"
          borderBottom={false}
          borderRight={false}
          paddingLeft={0}
          borderColor={colors.border}
        />
        {/* Label */}
        <Box flexGrow={1}>
          <Box
            paddingX={1}
            flexDirection="row"
            gap={1}
            justifyContent="flex-start"
          >
            <Box marginRight={showStatusIndicator ? -2 : -1}>
              {showStatusIndicator && (
                <ToolStatusIndicator status={status} name={title} />
              )}
            </Box>
            <Text bold color={colors.text}>
              {title}
            </Text>
            {suffix && (
              <Text color={colors.text} dimColor wrap="truncate-end">
                {suffix}
              </Text>
            )}
          </Box>
          {/* Top border after text */}
          <Box
            borderStyle="single"
            flexGrow={1}
            borderBottom={false}
            borderLeft={false}
            borderRight={false}
            borderColor={colors.border}
          />
        </Box>
        {/* Right border */}
        <Box
          borderStyle="round"
          borderBottom={false}
          borderLeft={false}
          paddingRight={1}
          borderColor={colors.border}
        ></Box>
      </Box>
      <Box
        borderStyle="round"
        borderTop={false}
        flexDirection="column"
        paddingX={1}
        paddingY={0}
        borderColor={colors.border}
      >
        {children}
      </Box>
    </Box>
  );
};
