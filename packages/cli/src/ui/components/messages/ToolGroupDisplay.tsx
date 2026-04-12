/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { CoreToolCallStatus } from '@google/gemini-cli-core';
import type {
  HistoryItem,
  HistoryItemWithoutId,
  HistoryItemToolDisplayGroup,
  ToolDisplayItem,
} from '../../types.js';
import { theme } from '../../semantic-colors.js';
import { ToolStatusIndicator } from './ToolShared.js';
import { useSettings } from '../../contexts/SettingsContext.js';

interface ToolGroupDisplayProps {
  item: HistoryItem | HistoryItemWithoutId;
  isToolGroupBoundary?: boolean;
}

export const ToolGroupDisplay: React.FC<ToolGroupDisplayProps> = ({
  item,
  isToolGroupBoundary,
}) => {
  const settings = useSettings();
  const isCompactModeEnabled = settings.merged.ui?.compactToolOutput === true;

  if (item.type !== 'tool_display_group') {
    return null;
  }

  const { tools, borderColor, borderDimColor, borderTop, borderBottom } =
    item as HistoryItemToolDisplayGroup;

  const visibleTools = tools.filter(
    (t) => t.status !== CoreToolCallStatus.AwaitingApproval,
  );

  const noticeTools = visibleTools.filter((t) => t.format === 'notice');
  const otherTools = visibleTools.filter(
    (t) => t.format !== 'notice' && t.format !== 'hidden',
  );

  const hasOtherTools = otherTools.length > 0;
  const isClosingSlice = tools.length === 0 && borderBottom;

  // If no tools are visible and it's not an explicit closing slice, hide the group
  if (visibleTools.length === 0 && !isClosingSlice) {
    return null;
  }

  // Standard view behavior: If compact mode is enabled, non-notice tools
  // are typically rendered without an outer box.
  const shouldShowBox =
    (hasOtherTools || isClosingSlice) && !isCompactModeEnabled;

  const boxBorderTop = borderTop || noticeTools.length > 0;

  return (
    <Box flexDirection="column">
      {noticeTools.map((tool, index) => {
        const isFirstInGroup = index === 0 && borderTop;
        const isLastElementInGroup =
          index === noticeTools.length - 1 && !shouldShowBox && borderBottom;

        return (
          <Box
            key={`notice-${index}`}
            marginTop={isFirstInGroup ? 1 : index > 0 ? 1 : 0}
            marginBottom={isLastElementInGroup ? 1 : 0}
          >
            <ToolDisplayMessage tool={tool} />
          </Box>
        );
      })}
      {shouldShowBox ? (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={borderColor}
          borderDimColor={borderDimColor}
          borderTop={boxBorderTop}
          borderBottom={borderBottom}
          borderLeft={!isToolGroupBoundary}
          borderRight={!isToolGroupBoundary}
          marginTop={boxBorderTop ? 1 : 0}
          marginBottom={borderBottom ? 1 : 0}
          paddingX={1}
        >
          {otherTools.map((tool, index) => (
            <ToolDisplayMessage key={`tool-${index}`} tool={tool} />
          ))}
        </Box>
      ) : otherTools.length > 0 ? (
        // Compact mode or no tools to box
        <Box
          flexDirection="column"
          marginTop={noticeTools.length > 0 ? 1 : 0}
          marginBottom={borderBottom ? 1 : 0}
        >
          {otherTools.map((tool, index) => (
            <ToolDisplayMessage key={`tool-${index}`} tool={tool} />
          ))}
        </Box>
      ) : null}
    </Box>
  );
};

interface ToolDisplayMessageProps {
  tool: ToolDisplayItem;
}

const ToolDisplayMessage: React.FC<ToolDisplayMessageProps> = ({ tool }) => {
  const settings = useSettings();
  const isCompactModeEnabled = settings.merged.ui?.compactToolOutput === true;

  // Since ToolDisplayItem is ToolDisplay & { status, ... }, we check for identifying properties
  // of ToolDisplay. If name or description is missing and there's no result, it might be "empty".
  // But per instructions, if display is missing (which we now interpret as the ToolDisplay part being effectively empty/null), show error.
  if (!tool.name && !tool.description && !tool.result && !tool.resultSummary) {
    return (
      <Box paddingLeft={2}>
        <ToolStatusIndicator
          status={tool.status}
          name={tool.originalRequestName || 'unknown'}
        />
        <Text color={theme.status.error}> Error: Tool display missing</Text>
      </Box>
    );
  }

  const {
    status,
    format: preferredFormat,
    name,
    description,
    resultSummary,
    result,
  } = tool;
  const format = preferredFormat || 'auto';

  if (format === 'hidden') {
    return null;
  }

  if (format === 'notice') {
    return (
      <Box paddingLeft={2} flexDirection="column">
        <Text color={theme.text.primary} bold wrap="truncate-end">
          {name || 'Topic'}:
        </Text>
        {description && (
          <Text color={theme.text.secondary} wrap="wrap">
            {description}
          </Text>
        )}
      </Box>
    );
  }

  const isCompact =
    format === 'compact' || (format === 'auto' && isCompactModeEnabled);

  if (isCompact) {
    return (
      <Box paddingLeft={2} flexDirection="row" flexWrap="wrap">
        <ToolStatusIndicator
          status={status}
          name={name || tool.originalRequestName || ''}
        />
        <Text bold color={theme.text.primary}>
          {' '}
          {name || tool.originalRequestName}{' '}
        </Text>
        {description && <Text color={theme.text.secondary}>{description}</Text>}
        {resultSummary && (
          <Text color={theme.text.accent}> → {resultSummary}</Text>
        )}
      </Box>
    );
  }

  // Box format (full)
  return (
    <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
      <Box flexDirection="row">
        <ToolStatusIndicator
          status={status}
          name={name || tool.originalRequestName || ''}
        />
        <Text bold color={theme.text.primary}>
          {' '}
          {name || tool.originalRequestName}{' '}
        </Text>
        {description && <Text color={theme.text.secondary}>{description}</Text>}
      </Box>
      {resultSummary && !result && (
        <Box paddingLeft={2}>
          <Text color={theme.text.accent}>→ {resultSummary}</Text>
        </Box>
      )}
      {result && (
        <Box paddingLeft={2} marginTop={0}>
          <ToolResultDisplayContent content={result} summary={resultSummary} />
        </Box>
      )}
    </Box>
  );
};

interface ToolResultDisplayContentProps {
  content: ToolDisplayItem['result'];
  summary?: string | null;
}

const ToolResultDisplayContent: React.FC<ToolResultDisplayContentProps> = ({
  content,
  summary,
}) => {
  if (!content) return null;

  switch (content.type) {
    case 'text':
      return (
        <Box flexDirection="column">
          <Text color={theme.text.secondary}>{content.text}</Text>
          {summary && (
            <Box marginTop={1}>
              <Text color={theme.text.secondary}>{summary}</Text>
            </Box>
          )}
        </Box>
      );
    case 'diff':
      // Simplified diff display for now
      return (
        <Box flexDirection="column">
          {summary && <Text color={theme.text.accent}>{summary}</Text>}
          <Text color={theme.text.secondary}>
            {`[Diff Display: ${content.beforeText.length} -> ${content.afterText.length} chars]`}
          </Text>
        </Box>
      );
    case 'terminal':
      return <Text color={theme.text.secondary}>[Terminal Output]</Text>;
    case 'agent':
      return (
        <Text color={theme.text.secondary}>[Subagent: {content.threadId}]</Text>
      );
    default:
      return null;
  }
};
