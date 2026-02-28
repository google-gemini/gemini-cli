/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { useUIState } from '../contexts/UIStateContext.js';
import { BaseSelectionList } from './shared/BaseSelectionList.js';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import open from 'open';
import path from 'node:path';

interface MemoryListProps {
  filePaths: string[];
  onClose: () => void;
  onError: (message: string) => void;
}

export const MemoryList: React.FC<MemoryListProps> = ({
  filePaths,
  onClose,
  onError,
}) => {
  const { terminalWidth, terminalHeight } = useUIState();
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const items = useMemo(
    () =>
      filePaths.map((filePath, index) => ({
        key: `file-${index}`,
        value: filePath,
        index,
      })),
    [filePaths],
  );

  useKeypress(
    (key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        onClose();
        return true;
      }

      if (keyMatchers[Command.OPEN_EXTERNAL_EDITOR](key)) {
        const selectedFile = filePaths[highlightedIndex];
        if (selectedFile) {
          // Using open package so we do not run into command injection issues
          open(selectedFile).catch((e: Error) => {
            onError(`Failed to open file: ${e.message}`);
          });
        }
        return true;
      }

      if (keyMatchers[Command.OPEN_DIRECTORY](key)) {
        const selectedFile = filePaths[highlightedIndex];
        if (selectedFile) {
          open(path.dirname(selectedFile)).catch((e: Error) => {
            onError(`Failed to open directory: ${e.message}`);
          });
        }
        return true;
      }

      return false;
    },
    { isActive: true },
  );

  const DIALOG_PADDING = 2;
  const HEADER_HEIGHT = 2;
  const CONTROLS_HEIGHT = 2;

  const listHeight = Math.max(
    5,
    terminalHeight - DIALOG_PADDING - HEADER_HEIGHT - CONTROLS_HEIGHT - 2,
  );

  const maxItemsToShow = Math.max(1, Math.floor(listHeight));

  if (filePaths.length === 0) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        padding={1}
        width={terminalWidth}
      >
        <Text>No GEMINI.md files found.</Text>
      </Box>
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      width={terminalWidth}
      paddingX={1}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold>{'> '}Memory Files</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        <BaseSelectionList
          items={items}
          initialIndex={highlightedIndex}
          isFocused={true}
          showNumbers={true}
          wrapAround={false}
          onSelect={() => {
            // Do nothing on enter for now, or just close
            onClose();
          }}
          onHighlight={(item: string) => {
            const index = filePaths.indexOf(item);
            if (index !== -1) {
              setHighlightedIndex(index);
            }
          }}
          maxItemsToShow={maxItemsToShow}
          renderItem={(itemWrapper, { isSelected }) => {
            const filePath = itemWrapper.value;
            const basename = path.basename(filePath);
            const dir = path.dirname(filePath);

            return (
              <Box flexDirection="column">
                <Text
                  color={isSelected ? theme.status.success : theme.text.primary}
                >
                  {basename}
                </Text>
                <Text color={theme.text.secondary}>{dir}</Text>
              </Box>
            );
          }}
        />
      </Box>

      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Use Esc to close, Ctrl+X to open in editor, Alt+O to open folder)
        </Text>
      </Box>
    </Box>
  );
};
