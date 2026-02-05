/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { TOOL_STATUS } from '../../constants.js';

/**
 * Props for the Card component.
 */
export interface CardProps {
  /** The main title of the card. */
  title: string;
  /** Optional text to display after the title (e.g., version, status). */
  suffix?: string;
  /** Optional icon or text to display before the title. */
  prefix?: boolean;
  /** The content to be displayed inside the card. */
  children?: React.ReactNode;
  /** The styling and intent of the card. */
  variant?: 'information' | 'success' | 'warning' | 'error' | 'confirmation';
}

export const Card: React.FC<CardProps> = ({
  variant = 'information',
  title,
  prefix = true,
  suffix,
  children,
}) => {
  const getColors = () => {
    switch (variant) {
      case 'error':
        return { border: theme.status.error, text: theme.status.error };
      case 'warning':
        return { border: theme.status.warning, text: theme.status.warning };
      case 'success':
        return { border: theme.status.success, text: theme.status.success };
      case 'confirmation':
        return { border: theme.border.focused, text: theme.text.link };
      case 'information':
        return { border: theme.border.default, text: theme.text.primary };
      default:
        return { border: theme.border.default, text: theme.text.primary };
    }
  };

  const getGlyph = () => {
    switch (variant) {
      case 'error':
        return TOOL_STATUS.ERROR;
      case 'success':
        return TOOL_STATUS.SUCCESS;
      case 'warning':
        return TOOL_STATUS.WARNING;
      case 'confirmation':
        return TOOL_STATUS.CONFIRMING;
      case 'information':
        return TOOL_STATUS.INFORMATION;
      default:
        return TOOL_STATUS.INFORMATION;
    }
  };

  const colors = getColors();
  const glyph = getGlyph();

  return (
    <Box flexDirection="column" marginBottom={1}>
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
            <Box>{prefix && <Text color={colors.text}>{glyph}</Text>}</Box>
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
      {/* Content area */}
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
