/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo, useState, useRef } from 'react';
import { Box, Text, type DOMElement } from 'ink';
import {
  CoreToolCallStatus,
  type FileDiff,
  type ListDirectoryResult,
  type ReadManyFilesResult,
  isFileDiff,
  hasSummary,
  isGrepResult,
  isListResult,
  isReadManyFilesResult,
} from '@google/gemini-cli-core';
import {
  type IndividualToolCallDisplay,
  type ToolResultDisplay,
  isTodoList,
} from '../../types.js';
import { useAlternateBuffer } from '../../hooks/useAlternateBuffer.js';
import { ToolStatusIndicator } from './ToolShared.js';
import { theme } from '../../semantic-colors.js';
import {
  DiffRenderer,
  renderDiffLines,
  isNewFile,
  parseDiffWithLineNumbers,
} from './DiffRenderer.js';
import { useMouseClick } from '../../hooks/useMouseClick.js';
import { ScrollableList } from '../shared/ScrollableList.js';
import { COMPACT_TOOL_SUBVIEW_MAX_LINES } from '../../constants.js';
import { useSettings } from '../../contexts/SettingsContext.js';
import { colorizeCode } from '../../utils/CodeColorizer.js';
import { useToolActions } from '../../contexts/ToolActionsContext.js';
import { getFileExtension } from '../../utils/fileUtils.js';

const PAYLOAD_MARGIN_LEFT = 6;
const PAYLOAD_BORDER_CHROME_WIDTH = 4; // paddingX=1 (2 cols) + borders (2 cols)
const PAYLOAD_SCROLL_GUTTER = 4;
const PAYLOAD_MAX_WIDTH = 120 + PAYLOAD_SCROLL_GUTTER;

interface DenseToolMessageProps extends IndividualToolCallDisplay {
  terminalWidth: number;
  availableTerminalHeight?: number;
}

interface ViewParts {
  // brief description of action
  description?: React.ReactNode;
  // result summary or status text
  summary?: React.ReactNode;
  // detailed output, e.g. diff or command output
  payload?: React.ReactNode;
}

interface PayloadResult {
  summary: string;
  payload: string;
}

const hasPayload = (res: unknown): res is PayloadResult => {
  if (!hasSummary(res)) return false;
  if (!('payload' in res)) return false;

  const value = (res as { payload?: unknown }).payload;
  return typeof value === 'string';
};

function getFileOpData(
  diff: FileDiff,
  status: CoreToolCallStatus,
  resultDisplay: ToolResultDisplay | undefined,
  terminalWidth: number,
  availableTerminalHeight: number | undefined,
  isClickable: boolean,
): ViewParts {
  const added =
    (diff.diffStat?.model_added_lines ?? 0) +
    (diff.diffStat?.user_added_lines ?? 0);
  const removed =
    (diff.diffStat?.model_removed_lines ?? 0) +
    (diff.diffStat?.user_removed_lines ?? 0);

  const isAcceptedOrConfirming =
    status === CoreToolCallStatus.Success ||
    status === CoreToolCallStatus.Executing ||
    status === CoreToolCallStatus.AwaitingApproval;

  const addColor = isAcceptedOrConfirming
    ? theme.status.success
    : theme.text.secondary;
  const removeColor = isAcceptedOrConfirming
    ? theme.status.error
    : theme.text.secondary;

  // Always show diff stats if available, using neutral colors for rejected
  const showDiffStat = !!diff.diffStat;

  const description = (
    <Box flexDirection="row">
      <Text color={theme.text.secondary} wrap="truncate-end">
        {diff.fileName}
      </Text>
    </Box>
  );
  let resultSummary = '';
  let resultColor = theme.text.secondary;

  if (status === CoreToolCallStatus.AwaitingApproval) {
    resultSummary = 'Confirming';
  } else if (
    status === CoreToolCallStatus.Success ||
    status === CoreToolCallStatus.Executing
  ) {
    resultSummary = 'Accepted';
    resultColor = theme.text.accent;
  } else if (status === CoreToolCallStatus.Cancelled) {
    resultSummary = 'Rejected';
    resultColor = theme.status.error;
  } else if (status === CoreToolCallStatus.Error) {
    resultSummary =
      typeof resultDisplay === 'string' ? resultDisplay : 'Failed';
    resultColor = theme.status.error;
  }

  const summary = (
    <Box flexDirection="row">
      {resultSummary && (
        <Text color={resultColor} wrap="truncate-end">
          →{' '}
          <Text underline={isClickable}>
            {resultSummary.replace(/\n/g, ' ')}
          </Text>
        </Text>
      )}
      {showDiffStat && (
        <Box marginLeft={1} marginRight={2}>
          <Text color={theme.text.secondary}>
            {'('}
            <Text color={addColor}>+{added}</Text>
            {', '}
            <Text color={removeColor}>-{removed}</Text>
            {')'}
          </Text>
        </Box>
      )}
    </Box>
  );

  const payload = (
    <DiffRenderer
      diffContent={diff.fileDiff}
      filename={diff.fileName}
      terminalWidth={terminalWidth - PAYLOAD_MARGIN_LEFT}
      availableTerminalHeight={availableTerminalHeight}
      disableColor={status === CoreToolCallStatus.Cancelled}
    />
  );

  return { description, summary, payload };
}

function getReadManyFilesData(result: ReadManyFilesResult): ViewParts {
  const includePatterns = result.include?.join(', ') ?? '';
  const description = (
    <Text color={theme.text.secondary} wrap="truncate-end">
      Attempting to read files from {includePatterns}
    </Text>
  );

  const skippedCount = result.skipped?.length ?? 0;
  const summaryStr = `Read ${result.files.length} file(s)${
    skippedCount > 0 ? ` (${skippedCount} ignored)` : ''
  }`;
  const summary = <Text color={theme.text.accent}>→ {summaryStr}</Text>;

  return { description, summary, payload: undefined };
}

function getListDirectoryData(
  result: ListDirectoryResult,
  originalDescription?: string,
): ViewParts {
  const description = originalDescription ? (
    <Text color={theme.text.secondary} wrap="truncate-end">
      {originalDescription}
    </Text>
  ) : undefined;
  const summary = <Text color={theme.text.accent}>→ {result.summary}</Text>;

  // For directory listings, we want NO payload in dense mode
  return { description, summary, payload: undefined };
}

function getListResultData(
  result: ListDirectoryResult | ReadManyFilesResult,
  originalDescription?: string,
): ViewParts {
  if (isReadManyFilesResult(result)) {
    return getReadManyFilesData(result);
  }
  return getListDirectoryData(result, originalDescription);
}

function getGenericSuccessData(
  resultDisplay: unknown,
  originalDescription?: string,
): ViewParts {
  let summary: React.ReactNode;
  let payload: React.ReactNode;

  const description = originalDescription ? (
    <Text color={theme.text.secondary} wrap="truncate-end">
      {originalDescription}
    </Text>
  ) : undefined;

  if (typeof resultDisplay === 'string') {
    const flattened = resultDisplay.replace(/\n/g, ' ').trim();
    summary = (
      <Text color={theme.text.accent} wrap="truncate-end">
        → {flattened}
      </Text>
    );
  } else if (isGrepResult(resultDisplay)) {
    summary = (
      <Text color={theme.text.accent} wrap="truncate-end">
        → {resultDisplay.summary}
      </Text>
    );
  } else if (isTodoList(resultDisplay)) {
    summary = (
      <Text color={theme.text.accent} wrap="wrap">
        → Todos updated
      </Text>
    );
  } else if (hasPayload(resultDisplay)) {
    summary = <Text color={theme.text.accent}>→ {resultDisplay.summary}</Text>;
    payload = (
      <Box marginLeft={2}>
        <Text color={theme.text.secondary}>{resultDisplay.payload}</Text>
      </Box>
    );
  } else {
    summary = (
      <Text color={theme.text.accent} wrap="wrap">
        → Returned (possible empty result)
      </Text>
    );
  }

  return { description, summary, payload };
}

export const DenseToolMessage: React.FC<DenseToolMessageProps> = (props) => {
  const {
    callId,
    name,
    status,
    resultDisplay,
    confirmationDetails,
    outputFile,
    terminalWidth,
    availableTerminalHeight,
    description: originalDescription,
  } = props;

  const settings = useSettings();
  const isAlternateBuffer = useAlternateBuffer();
  const { isExpanded: isExpandedInContext, toggleExpansion } = useToolActions();

  // Handle optional context members
  const [localIsExpanded, setLocalIsExpanded] = useState(false);
  const isExpanded = isExpandedInContext
    ? isExpandedInContext(callId)
    : localIsExpanded;

  const [isFocused, setIsFocused] = useState(false);
  const toggleRef = useRef<DOMElement>(null);

  // Unified File Data Extraction (Safely bridge resultDisplay and confirmationDetails)
  const diff = useMemo((): FileDiff | undefined => {
    if (isFileDiff(resultDisplay)) return resultDisplay;
    if (confirmationDetails?.type === 'edit') {
      const details = confirmationDetails;
      return {
        fileName: details.fileName,
        fileDiff: details.fileDiff,
        filePath: details.filePath,
        originalContent: details.originalContent,
        newContent: details.newContent,
        diffStat: details.diffStat,
      };
    }
    return undefined;
  }, [resultDisplay, confirmationDetails]);

  const handleToggle = () => {
    const next = !isExpanded;
    if (!next) {
      setIsFocused(false);
    } else {
      setIsFocused(true);
    }

    if (toggleExpansion) {
      toggleExpansion(callId);
    } else {
      setLocalIsExpanded(next);
    }
  };

  useMouseClick(toggleRef, handleToggle, {
    isActive: isAlternateBuffer && !!diff,
  });

  // State-to-View Coordination
  const viewParts = useMemo((): ViewParts => {
    if (diff) {
      return getFileOpData(
        diff,
        status,
        resultDisplay,
        terminalWidth,
        availableTerminalHeight,
        isAlternateBuffer,
      );
    }
    if (isListResult(resultDisplay)) {
      return getListResultData(resultDisplay, originalDescription);
    }

    if (isGrepResult(resultDisplay)) {
      return getGenericSuccessData(resultDisplay, originalDescription);
    }

    if (status === CoreToolCallStatus.Success && resultDisplay) {
      return getGenericSuccessData(resultDisplay, originalDescription);
    }
    if (status === CoreToolCallStatus.Error) {
      const text =
        typeof resultDisplay === 'string'
          ? resultDisplay.replace(/\n/g, ' ')
          : 'Failed';
      const errorSummary = (
        <Text color={theme.status.error} wrap="truncate-end">
          → {text}
        </Text>
      );
      const descriptionText = originalDescription ? (
        <Text color={theme.text.secondary} wrap="truncate-end">
          {originalDescription}
        </Text>
      ) : undefined;
      return {
        description: descriptionText,
        summary: errorSummary,
        payload: undefined,
      };
    }

    const descriptionText = originalDescription ? (
      <Text color={theme.text.secondary} wrap="truncate-end">
        {originalDescription}
      </Text>
    ) : undefined;
    return {
      description: descriptionText,
      summary: undefined,
      payload: undefined,
    };
  }, [
    diff,
    status,
    resultDisplay,
    terminalWidth,
    availableTerminalHeight,
    originalDescription,
    isAlternateBuffer,
  ]);

  const { description, summary } = viewParts;

  const diffLines = useMemo(() => {
    if (!diff || !isExpanded || !isAlternateBuffer) return [];

    const parsedLines = parseDiffWithLineNumbers(diff.fileDiff);
    const isNewFileResult = isNewFile(parsedLines);

    if (isNewFileResult) {
      const addedContent = parsedLines
        .filter((line) => line.type === 'add')
        .map((line) => line.content)
        .join('\n');

      const fileExtension = getFileExtension(diff.fileName);

      return colorizeCode({
        code: addedContent,
        language: fileExtension,
        maxWidth: terminalWidth - PAYLOAD_MARGIN_LEFT,
        settings,
        disableColor: status === CoreToolCallStatus.Cancelled,
        returnLines: true,
      });
    } else {
      return renderDiffLines({
        parsedLines,
        filename: diff.fileName,
        terminalWidth: terminalWidth - PAYLOAD_MARGIN_LEFT,
        disableColor: status === CoreToolCallStatus.Cancelled,
      });
    }
  }, [diff, isExpanded, isAlternateBuffer, terminalWidth, settings, status]);

  const showPayload = useMemo(() => {
    const policy = !isAlternateBuffer || !diff || isExpanded;
    if (!policy) return false;

    if (diff) {
      if (isAlternateBuffer) {
        return isExpanded && diffLines.length > 0;
      }
      // In non-alternate buffer mode, we always show the diff.
      return true;
    }

    return !!(viewParts.payload || outputFile);
  }, [
    isAlternateBuffer,
    diff,
    isExpanded,
    diffLines.length,
    viewParts.payload,
    outputFile,
  ]);

  const keyExtractor = (_item: React.ReactNode, index: number) =>
    `diff-line-${index}`;
  const renderItem = ({ item }: { item: React.ReactNode }) => (
    <Box minHeight={1}>{item}</Box>
  );

  return (
    <Box flexDirection="column">
      <Box marginLeft={2} flexDirection="row" flexWrap="wrap">
        <Box flexDirection="row" flexShrink={1}>
          <ToolStatusIndicator status={status} name={name} />
          <Box maxWidth={25} flexShrink={0} flexGrow={0}>
            <Text color={theme.text.primary} bold wrap="truncate-end">
              {name}{' '}
            </Text>
          </Box>
          <Box marginLeft={1} flexShrink={1} flexGrow={0}>
            {description}
          </Box>
        </Box>

        {summary && (
          <Box
            key="tool-summary"
            ref={isAlternateBuffer && diff ? toggleRef : undefined}
            marginLeft={1}
            flexGrow={0}
          >
            {summary}
          </Box>
        )}
      </Box>

      {showPayload && isAlternateBuffer && diffLines.length > 0 && (
        <Box
          marginLeft={PAYLOAD_MARGIN_LEFT}
          marginTop={1}
          marginBottom={1}
          paddingX={1}
          flexDirection="column"
          height={
            Math.min(diffLines.length, COMPACT_TOOL_SUBVIEW_MAX_LINES) + 2
          }
          maxHeight={COMPACT_TOOL_SUBVIEW_MAX_LINES + 2}
          borderStyle="round"
          borderColor={theme.border.default}
          borderDimColor={true}
          maxWidth={Math.min(
            PAYLOAD_MAX_WIDTH,
            terminalWidth - PAYLOAD_MARGIN_LEFT,
          )}
        >
          <ScrollableList
            data={diffLines}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            estimatedItemHeight={() => 1}
            hasFocus={isFocused}
            width={Math.min(
              PAYLOAD_MAX_WIDTH,
              terminalWidth -
                PAYLOAD_MARGIN_LEFT -
                PAYLOAD_BORDER_CHROME_WIDTH -
                PAYLOAD_SCROLL_GUTTER,
            )}
          />
        </Box>
      )}

      {showPayload && (!isAlternateBuffer || !diff) && viewParts.payload && (
        <Box marginLeft={PAYLOAD_MARGIN_LEFT} marginTop={1} marginBottom={1}>
          {viewParts.payload}
        </Box>
      )}

      {showPayload && outputFile && (
        <Box marginLeft={PAYLOAD_MARGIN_LEFT} marginTop={1} marginBottom={1}>
          <Text color={theme.text.secondary}>
            (Output saved to: {outputFile})
          </Text>
        </Box>
      )}
    </Box>
  );
};
