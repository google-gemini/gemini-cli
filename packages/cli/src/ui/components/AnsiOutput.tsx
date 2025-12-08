/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import Link from 'ink-link';
import type { AnsiLine, AnsiOutput, AnsiToken } from '@google/gemini-cli-core';
import { URL_REGEX, isUrl } from '../utils/urlUtils.js';
import { theme } from '../semantic-colors.js';

const DEFAULT_HEIGHT = 24;

interface AnsiOutputProps {
  data: AnsiOutput;
  availableTerminalHeight?: number;
  width: number;
}

export const AnsiOutputText: React.FC<AnsiOutputProps> = ({
  data,
  availableTerminalHeight,
  width,
}) => {
  const lastLines = data.slice(
    -(availableTerminalHeight && availableTerminalHeight > 0
      ? availableTerminalHeight
      : DEFAULT_HEIGHT),
  );
  // Parse URLs in the token text and wrap them in Link component
  const renderToken = (token: AnsiToken, keyPrefix: string) => {
    const parts = token.text.split(URL_REGEX);
    return parts.map((part, index) => {
      const partIsUrl = isUrl(part);
      const key = `${keyPrefix}-${index}`;

      const textProps = {
        color:
          partIsUrl && !token.inverse
            ? theme.text.link
            : token.inverse
              ? token.bg
              : token.fg,
        backgroundColor: token.inverse ? token.fg : token.bg,
        dimColor: token.dim,
        bold: token.bold,
        italic: token.italic,
        // Ensure links are underlined
        underline: partIsUrl || token.underline,
      };

      if (partIsUrl) {
        return (
          <Link key={key} url={part} fallback={false}>
            <Text {...textProps}>{part}</Text>
          </Link>
        );
      }

      return (
        <Text key={key} {...textProps}>
          {part}
        </Text>
      );
    });
  };

  return (
    <Box flexDirection="column" width={width} flexShrink={0}>
      {lastLines.map((line: AnsiLine, lineIndex: number) => (
        <Text key={lineIndex} wrap="truncate">
          {line.length > 0
            ? line.map((token: AnsiToken, tokenIndex: number) =>
                renderToken(token, `${lineIndex}-${tokenIndex}`),
              )
            : null}
        </Text>
      ))}
    </Box>
  );
};
