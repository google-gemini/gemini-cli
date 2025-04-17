import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { ToolCallStatus } from '../../types.js';
import { ToolResultDisplay } from '../../../tools/tools.js';
import DiffRenderer from './DiffRenderer.js';
import { MarkdownRenderer } from '../../utils/MarkdownRenderer.js';

interface ToolMessageProps {
  name: string;
  description: string;
  resultDisplay: ToolResultDisplay | undefined;
  status: ToolCallStatus;
}

const ToolMessage: React.FC<ToolMessageProps> = ({
  name,
  description,
  resultDisplay,
  status,
}) => {
  const statusIndicatorWidth = 3;
  const hasResult =
    (status === ToolCallStatus.Invoked || status === ToolCallStatus.Canceled) &&
    resultDisplay &&
    resultDisplay.toString().trim().length > 0;

  return (
    <Box paddingX={1} paddingY={0} flexDirection="column">
      {/* Row for Status Indicator and Tool Info */}
      <Box minHeight={1}>
        {/* Status Indicator */}
        <Box minWidth={statusIndicatorWidth}>
          {status === ToolCallStatus.Pending && <Spinner type="dots" />}
          {status === ToolCallStatus.Invoked && <Text color="green">✔</Text>}
          {status === ToolCallStatus.Confirming && <Text color="blue">?</Text>}
          {status === ToolCallStatus.Canceled && (
            <Text color="red" bold>
              -
            </Text>
          )}
        </Box>
        <Box>
          <Text
            color="blue"
            wrap="truncate-end"
            strikethrough={status === ToolCallStatus.Canceled}
          >
            <Text bold>{name}</Text> <Text color="gray">{description}</Text>
          </Text>
        </Box>
      </Box>

      {hasResult && (
        <Box paddingLeft={statusIndicatorWidth}>
          <Box flexShrink={1} flexDirection="row">
            <Text color="gray">↳ </Text>
            {/* Use default text color (white) or gray instead of dimColor */}
            {typeof resultDisplay === 'string' && (
              <Box flexDirection="column">
                {MarkdownRenderer.render(resultDisplay)}
              </Box>
            )}
            {typeof resultDisplay === 'object' && (
              <DiffRenderer diffContent={resultDisplay.fileDiff} />
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default ToolMessage;
