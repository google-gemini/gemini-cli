/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box } from 'ink';
import type { IndividualToolCallDisplay } from '../../types.js';
import { StickyHeader } from '../StickyHeader.js';
import { ToolResultDisplay } from './ToolResultDisplay.js';
import {
  ToolStatusIndicator,
  ToolInfo,
  TrailingIndicator,
  type TextEmphasis,
} from './ToolShared.js';

export type { TextEmphasis };

export interface ToolMessageProps extends IndividualToolCallDisplay {
  availableTerminalHeight?: number;
  terminalWidth: number;
  emphasis?: TextEmphasis;
  renderOutputAsMarkdown?: boolean;
  isFirst: boolean;
  borderColor: string;
  borderDimColor: boolean;
}

export const ToolMessage: React.FC<ToolMessageProps> = ({
  name,
  description,
  resultDisplay,
  status,
  availableTerminalHeight,
  terminalWidth,
  emphasis = 'medium',
  renderOutputAsMarkdown = true,
  isFirst,
  borderColor,
  borderDimColor,
}) => (
  <Box flexDirection="column" width={terminalWidth}>
    <StickyHeader
      width={terminalWidth}
      isFirst={isFirst}
      borderColor={borderColor}
      borderDimColor={borderDimColor}
    >
      <ToolStatusIndicator status={status} name={name} />
      <ToolInfo
        name={name}
        status={status}
        description={description}
        emphasis={emphasis}
      />
      {emphasis === 'high' && <TrailingIndicator />}
    </StickyHeader>
    <Box
      width={terminalWidth}
      borderStyle="round"
      borderColor={borderColor}
      borderDimColor={borderDimColor}
      borderTop={false}
      borderBottom={false}
      borderLeft={true}
      borderRight={true}
      paddingX={1}
      flexDirection="column"
    >
      <ToolResultDisplay
        resultDisplay={resultDisplay}
        availableTerminalHeight={availableTerminalHeight}
        terminalWidth={terminalWidth}
        renderOutputAsMarkdown={renderOutputAsMarkdown}
      />
    </Box>
  </Box>
);
