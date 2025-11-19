/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { IndividualToolCallDisplay } from '../../types.js';
import { ToolCallStatus } from '../../types.js';
import { DiffRenderer } from './DiffRenderer.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { AnsiOutputText } from '../AnsiOutput.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';
import { ShellInputPrompt } from '../ShellInputPrompt.js';
import { StickyHeader } from '../StickyHeader.js';
import { theme } from '../../semantic-colors.js';

const RESERVED_LINE_COUNT = 5;
const MIN_LINES_SHOWN = 2;

export const ToolMessage: React.FC<{ toolCall: IndividualToolCallDisplay }> = ({ toolCall }) => {
  const { name, status, resultDisplay, description } = toolCall;

  const renderResult = () => {
    if (typeof resultDisplay === 'string') {
      return <MarkdownDisplay text={resultDisplay} />;
    }

    if (resultDisplay?.type === 'fileDiff') {
      return <DiffRenderer diff={resultDisplay.diff} />;
    }

    if (resultDisplay?.type === 'ansiOutput') {
      return <AnsiOutputText output={resultDisplay.output} />;
    }

    return null;
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      <StickyHeader>
        <Text bold color={theme.text.primary}>
          Tool: {name}
        </Text>
        <Text color={theme.text.secondary}>
          Status: {status}
        </Text>
      </StickyHeader>
      {description && (
        <Text color={theme.text.secondary}>
          Description: {description}
        </Text>
      )}
      <MaxSizedBox maxHeight={10}>
        {renderResult()}
      </MaxSizedBox>
      {status === ToolCallStatus.Executing && <ShellInputPrompt />}
    </Box>
  );
};
