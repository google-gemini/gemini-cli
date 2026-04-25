/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useId } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import type { IndividualToolCallDisplay } from '../../types.js';
import { ToolResultDisplay } from './ToolResultDisplay.js';
import { useOverflowActions } from '../../contexts/OverflowContext.js';

export interface MempalaceGroupDisplayProps {
  toolCalls: IndividualToolCallDisplay[];
  availableTerminalHeight?: number;
  terminalWidth: number;
  borderColor?: string;
  borderDimColor?: boolean;
  isFirst?: boolean;
  isExpandable?: boolean;
}

export const MempalaceGroupDisplay: React.FC<MempalaceGroupDisplayProps> = ({
  toolCalls,
  availableTerminalHeight,
  terminalWidth,
  borderColor,
  borderDimColor,
  isFirst,
  isExpandable = true,
}) => {
  const isExpanded = availableTerminalHeight === undefined;
  const overflowActions = useOverflowActions();
  const uniqueId = useId();
  const overflowId = `mempalace-${uniqueId}`;

  useEffect(() => {
    if (isExpandable && overflowActions) {
      overflowActions.addOverflowingId(overflowId);
    }
    return () => {
      if (overflowActions) {
        overflowActions.removeOverflowingId(overflowId);
      }
    };
  }, [isExpandable, overflowActions, overflowId]);

  if (toolCalls.length === 0) {
    return null;
  }

  // Use the first tool's name for the header
  const mainTool = toolCalls[0];
  const headerText = `Memory: ${mainTool.name.replace(/^mempalace_/, '')}${toolCalls.length > 1 ? ` (+${toolCalls.length - 1} more)` : ''}`;
  const toggleText = `(ctrl+o to ${isExpanded ? 'collapse' : 'expand'})`;

  return (
    <Box
      flexDirection="column"
      width={terminalWidth}
      borderLeft={true}
      borderRight={true}
      borderTop={isFirst}
      borderBottom={false}
      borderColor={borderColor}
      borderDimColor={borderDimColor}
      borderStyle="round"
      paddingLeft={1}
      paddingTop={0}
      paddingBottom={0}
    >
      <Box flexDirection="row" gap={1} marginBottom={isExpanded ? 1 : 0}>
        <Text color={theme.text.secondary}>≡</Text>
        <Text bold color={theme.text.primary}>
          {headerText}
        </Text>
        {isExpandable && <Text color={theme.text.secondary}>{toggleText}</Text>}
      </Box>

      {isExpanded &&
        toolCalls.map((toolCall) => (
          <Box
            key={toolCall.callId}
            flexDirection="column"
            marginLeft={0}
            marginBottom={1}
          >
            <Box flexDirection="row" gap={1}>
              <Text color={theme.text.secondary}>•</Text>
              <Text bold color={theme.text.primary}>
                {toolCall.name}
              </Text>
            </Box>
            <Box marginLeft={2}>
              <ToolResultDisplay
                resultDisplay={toolCall.resultDisplay}
                availableTerminalHeight={undefined} // Force full render inside the expansion
                terminalWidth={terminalWidth - 4}
                renderOutputAsMarkdown={true}
              />
            </Box>
          </Box>
        ))}

      {!isExpanded && (
        <Box marginLeft={2}>
          <Text color={theme.text.secondary} italic>
            {toolCalls.length} memory operation(s) filed away...
          </Text>
        </Box>
      )}
    </Box>
  );
};
