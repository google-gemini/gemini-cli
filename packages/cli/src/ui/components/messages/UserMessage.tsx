/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FC } from 'react';
import { useMemo } from 'react';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';
import { SCREEN_READER_USER_PREFIX } from '../../textConstants.js';
import { isSlashCommand as checkIsSlashCommand } from '../../utils/commandUtils.js';
import {
  calculateTransformationsForLine,
  calculateTransformedLine,
} from '../shared/text-buffer.js';
import { unescapePath } from '@google/gemini-cli-core';
import { MediaVisualizer } from '../MediaVisualizer.js';
import { HalfLinePaddedBox } from '../shared/HalfLinePaddedBox.js';
import { useConfig } from '../../contexts/ConfigContext.js';

interface UserMessageProps {
  text: string;
  width: number;
}

export const UserMessage: FC<UserMessageProps> = ({ text, width }) => {
  const prefix = '> ';
  const prefixWidth = prefix.length;
  const isSlashCommand = checkIsSlashCommand(text);
  const config = useConfig();
  const useBackgroundColor = config.getUseBackgroundColor();

  const textColor = isSlashCommand ? theme.text.accent : theme.text.secondary;

  const { displayText, imagePaths } = useMemo(() => {
    if (!text) return { displayText: text, imagePaths: [] };
    const paths = new Set<string>();
    const displayLines = text.split('\n').map((line) => {
      const transformations = calculateTransformationsForLine(line);
      for (const t of transformations) {
        if (t.type === 'image') {
          const withoutAt = t.logicalText.startsWith('@')
            ? t.logicalText.slice(1)
            : t.logicalText;
          const candidatePath = unescapePath(withoutAt);
          paths.add(candidatePath);
        }
      }
      // We pass a cursor position of [-1, -1] so that no transformations are expanded (e.g. images remain collapsed)
      const { transformedLine } = calculateTransformedLine(
        line,
        0, // line index doesn't matter since cursor is [-1, -1]
        [-1, -1],
        transformations,
      );
      return transformedLine;
    });
    return {
      displayText: displayLines.join('\n'),
      imagePaths: Array.from(paths),
    };
  }, [text]);

  return (
    <HalfLinePaddedBox
      backgroundBaseColor={theme.background.message}
      backgroundOpacity={1}
      useBackgroundColor={useBackgroundColor}
    >
      <Box
        flexDirection="row"
        paddingY={0}
        marginY={useBackgroundColor ? 0 : 1}
        paddingX={useBackgroundColor ? 1 : 0}
        alignSelf="flex-start"
        width={width}
      >
        <Box width={prefixWidth} flexShrink={0}>
          <Text
            color={theme.text.accent}
            aria-label={SCREEN_READER_USER_PREFIX}
          >
            {prefix}
          </Text>
        </Box>
        <Box flexGrow={1} flexDirection="column">
          <Text wrap="wrap" color={textColor}>
            {displayText}
          </Text>
          {imagePaths.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              {imagePaths.map((imagePath, index) => (
                <Box key={imagePath + index} marginBottom={1}>
                  <MediaVisualizer imagePath={imagePath} />
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </HalfLinePaddedBox>
  );
};
