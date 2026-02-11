/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import { ToolCallStatus } from '../../types.js';
import type {
  IndividualToolCallDisplay,
  FileDiff,
  GrepResult,
  ListDirectoryResult,
  ReadManyFilesResult,
} from '../../types.js';
import { ToolStatusIndicator } from './ToolShared.js';
import { theme } from '../../semantic-colors.js';
import { DiffRenderer } from './DiffRenderer.js';

interface DenseToolMessageProps extends IndividualToolCallDisplay {
  terminalWidth?: number;
  availableTerminalHeight?: number;
}

interface ViewParts {
  description?: string;
  summary?: React.ReactNode;
  payload?: React.ReactNode;
}

/**
 * --- TYPE GUARDS ---
 */
const isFileDiff = (res: unknown): res is FileDiff =>
  typeof res === 'object' && res !== null && 'fileDiff' in res;

const isGrepResult = (res: unknown): res is GrepResult =>
  typeof res === 'object' &&
  res !== null &&
  'summary' in res &&
  ('matches' in res || 'payload' in res);

const isListResult = (
  res: unknown,
): res is ListDirectoryResult | ReadManyFilesResult =>
  typeof res === 'object' &&
  res !== null &&
  'summary' in res &&
  ('files' in res || 'include' in res);

const hasPayload = (
  res: unknown,
): res is { summary: string; payload: string } =>
  typeof res === 'object' &&
  res !== null &&
  'payload' in res &&
  'summary' in res;

const isTodoList = (res: unknown): res is { todos: unknown[] } =>
  typeof res === 'object' && res !== null && 'todos' in res;

/**
 * --- RENDER HELPERS ---
 */

const RenderItemsList: React.FC<{
  items?: string[];
  maxVisible?: number;
}> = ({ items, maxVisible = 20 }) => {
  if (!items || items.length === 0) return null;
  return (
    <Box flexDirection="column">
      {items.slice(0, maxVisible).map((item, i) => (
        <Text key={i} color={theme.text.secondary}>
          {item}
        </Text>
      ))}
      {items.length > maxVisible && (
        <Text color={theme.text.secondary}>
          ... and {items.length - maxVisible} more
        </Text>
      )}
    </Box>
  );
};

/**
 * --- SCENARIO LOGIC (Pure Functions) ---
 */

function getFileOpData(
  diff: FileDiff,
  status: ToolCallStatus,
  resultDisplay: unknown,
  terminalWidth?: number,
  availableTerminalHeight?: number,
): ViewParts {
  const added =
    (diff.diffStat?.model_added_lines ?? 0) +
    (diff.diffStat?.user_added_lines ?? 0);
  const removed =
    (diff.diffStat?.model_removed_lines ?? 0) +
    (diff.diffStat?.user_removed_lines ?? 0);
  const stats = diff.diffStat ? ` (+${added}, -${removed})` : '';

  const description = `${diff.fileName}${stats}`;
  let decision = '';
  let decisionColor = theme.text.secondary;

  if (
    status === ToolCallStatus.Success ||
    status === ToolCallStatus.Executing
  ) {
    decision = 'Accepted';
    decisionColor = theme.text.accent;
  } else if (status === ToolCallStatus.Canceled) {
    decision = 'Rejected';
    decisionColor = theme.text.primary;
  } else if (status === ToolCallStatus.Confirming) {
    decision = 'Confirming';
  } else if (status === ToolCallStatus.Error) {
    decision = typeof resultDisplay === 'string' ? resultDisplay : 'Failed';
    decisionColor = theme.text.accent;
  }

  const summary = decision ? (
    <Text color={decisionColor} wrap="truncate-end">
      → {decision.replace(/\n/g, ' ')}
    </Text>
  ) : undefined;

  const payload = (
    <DiffRenderer
      diffContent={diff.fileDiff}
      filename={diff.fileName}
      terminalWidth={terminalWidth ? terminalWidth - 6 : 80}
      availableTerminalHeight={availableTerminalHeight}
      disableColor={status === ToolCallStatus.Canceled}
    />
  );

  return { description, summary, payload };
}

function getListResultData(
  result: ListDirectoryResult | ReadManyFilesResult,
  toolName: string,
  originalDescription?: string,
): ViewParts {
  let description = originalDescription;
  const items: string[] = result.files ?? [];
  const maxVisible = 10;

  // Enhance with ReadManyFiles specific data if present
  const rmf = result as ReadManyFilesResult;
  if (toolName === 'ReadManyFiles' && rmf.include) {
    const includePatterns = rmf.include.join(', ');
    description = `Attempting to read files from ${includePatterns}`;
    result.summary = `Read ${items.length} file(s)`;
  }

  const summary = <Text color={theme.text.accent}>→ {result.summary}</Text>;

  const skippedCount = rmf.skipped?.length ?? 0;
  const skippedText =
    skippedCount > 0 ? `(${skippedCount} skipped)` : undefined;

  const excludedText =
    rmf.excludes && rmf.excludes.length > 0
      ? `Excluded patterns: ${rmf.excludes.slice(0, 3).join(', ')}${rmf.excludes.length > 3 ? '...' : ''}`
      : undefined;

  const hasItems = items.length > 0;
  const payload =
    hasItems || skippedText || excludedText ? (
      <Box flexDirection="column" marginLeft={2}>
        {hasItems && <RenderItemsList items={items} maxVisible={maxVisible} />}
        {skippedText && (
          <Text color={theme.text.secondary} dimColor>
            {skippedText}
          </Text>
        )}
        {excludedText && (
          <Text color={theme.text.secondary} dimColor>
            {excludedText}
          </Text>
        )}
      </Box>
    ) : undefined;

  return { description, summary, payload };
}

function getGenericSuccessData(
  resultDisplay: unknown,
  originalDescription?: string,
): ViewParts {
  let summary: React.ReactNode;
  let payload: React.ReactNode;

  if (typeof resultDisplay === 'string') {
    const flattened = resultDisplay.replace(/\n/g, ' ').trim();
    summary = (
      <Text color={theme.text.accent} wrap="wrap">
        → {flattened.length > 120 ? flattened.slice(0, 117) + '...' : flattened}
      </Text>
    );
  } else if (isGrepResult(resultDisplay)) {
    summary = <Text color={theme.text.accent}>→ {resultDisplay.summary}</Text>;
    const matches = resultDisplay.matches ?? [];
    if (matches.length > 0) {
      payload = (
        <Box flexDirection="column" marginLeft={2}>
          <RenderItemsList
            items={matches.map(
              (m) => `${m.filePath}:${m.lineNumber}: ${m.line.trim()}`,
            )}
            maxVisible={10}
          />
        </Box>
      );
    }
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
        → Output received
      </Text>
    );
  }

  return { description: originalDescription, summary, payload };
}

/**
 * --- MAIN COMPONENT ---
 */

export const DenseToolMessage: React.FC<DenseToolMessageProps> = (props) => {
  const {
    name,
    status,
    resultDisplay,
    confirmationDetails,
    outputFile,
    terminalWidth,
    availableTerminalHeight,
    description: originalDescription,
  } = props;

  // 1. Unified File Data Extraction (Safely bridge resultDisplay and confirmationDetails)
  const diff = useMemo((): FileDiff | undefined => {
    if (isFileDiff(resultDisplay)) return resultDisplay;
    if (confirmationDetails?.type === 'edit') {
      return {
        fileName: confirmationDetails.fileName,
        fileDiff: confirmationDetails.fileDiff,
        filePath: confirmationDetails.filePath,
        originalContent: confirmationDetails.originalContent,
        newContent: confirmationDetails.newContent,
        diffStat: confirmationDetails.diffStat,
      };
    }
    return undefined;
  }, [resultDisplay, confirmationDetails]);

  // 2. State-to-View Coordination
  const viewParts = useMemo((): ViewParts => {
    if (diff) {
      return getFileOpData(
        diff,
        status,
        resultDisplay,
        terminalWidth,
        availableTerminalHeight,
      );
    }
    if (isListResult(resultDisplay)) {
      return getListResultData(resultDisplay, name, originalDescription);
    }

    if (isGrepResult(resultDisplay)) {
      return getGenericSuccessData(resultDisplay, originalDescription);
    }

    if (status === ToolCallStatus.Success && resultDisplay) {
      return getGenericSuccessData(resultDisplay, originalDescription);
    }
    if (status === ToolCallStatus.Error) {
      const text =
        typeof resultDisplay === 'string'
          ? resultDisplay.replace(/\n/g, ' ')
          : 'Failed';
      const errorSummary = (
        <Text color={theme.text.accent} wrap="wrap">
          → {text.length > 120 ? text.slice(0, 117) + '...' : text}
        </Text>
      );
      return {
        description: originalDescription,
        summary: errorSummary,
        payload: undefined,
      };
    }

    return {
      description: originalDescription,
      summary: undefined,
      payload: undefined,
    };
  }, [
    diff,
    status,
    resultDisplay,
    name,
    terminalWidth,
    availableTerminalHeight,
    originalDescription,
  ]);

  const { description, summary, payload } = viewParts;

  // 3. Final Layout
  return (
    <Box flexDirection="column" marginBottom={payload ? 1 : 0}>
      <Box marginLeft={3} flexDirection="row" flexWrap="wrap">
        <ToolStatusIndicator status={status} name={name} />
        <Box maxWidth={25} flexShrink={1} flexGrow={0}>
          <Text color={theme.text.primary} bold wrap="truncate-end">
            {name}{' '}
          </Text>
        </Box>
        <Box marginLeft={1} flexShrink={1} flexGrow={0}>
          <Text color={theme.text.secondary} wrap="truncate-end">
            {description}
          </Text>
        </Box>
        {summary && (
          <Box marginLeft={1} flexGrow={1}>
            {summary}
          </Box>
        )}
      </Box>
      {payload && <Box marginLeft={6}>{payload}</Box>}
      {outputFile && (
        <Box marginLeft={6}>
          <Text color={theme.text.secondary}>
            (Output saved to: {outputFile})
          </Text>
        </Box>
      )}
    </Box>
  );
};
