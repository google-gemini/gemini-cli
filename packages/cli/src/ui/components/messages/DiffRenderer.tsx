/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import crypto from 'node:crypto';
import * as Diff from 'diff';
import { colorizeCode, colorizeLine } from '../../utils/CodeColorizer.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';
import { theme as semanticTheme } from '../../semantic-colors.js';
import type { Theme } from '../../themes/theme.js';
import { useSettings } from '../../contexts/SettingsContext.js';

interface DiffLine {
  type: 'add' | 'del' | 'context' | 'hunk' | 'other';
  oldLine?: number;
  newLine?: number;
  content: string;
}

interface DiffChangeGroup {
  type: 'change';
  removed: DiffLine[];
  added: DiffLine[];
}

type GroupedDiffLine = DiffLine | DiffChangeGroup;

function groupDiffLines(lines: DiffLine[]): GroupedDiffLine[] {
  const grouped: GroupedDiffLine[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === 'del') {
      const removed: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'del') {
        removed.push(lines[i]);
        i++;
      }
      const added: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'add') {
        added.push(lines[i]);
        i++;
      }
      if (added.length > 0) {
        grouped.push({ type: 'change', removed, added });
      } else {
        grouped.push(...removed);
      }
    } else {
      grouped.push(lines[i]);
      i++;
    }
  }
  return grouped;
}

function parseDiffWithLineNumbers(diffContent: string): DiffLine[] {
  const lines = diffContent.split('\n');
  const result: DiffLine[] = [];
  let currentOldLine = 0;
  let currentNewLine = 0;
  let inHunk = false;
  const hunkHeaderRegex = /^@@ -(\d+),?\d* \+(\d+),?\d* @@/;

  for (const line of lines) {
    const hunkMatch = line.match(hunkHeaderRegex);
    if (hunkMatch) {
      currentOldLine = parseInt(hunkMatch[1], 10);
      currentNewLine = parseInt(hunkMatch[2], 10);
      inHunk = true;
      result.push({ type: 'hunk', content: line });
      // We need to adjust the starting point because the first line number applies to the *first* actual line change/context,
      // but we increment *before* pushing that line. So decrement here.
      currentOldLine--;
      currentNewLine--;
      continue;
    }
    if (!inHunk) {
      // Skip standard Git header lines more robustly
      if (line.startsWith('--- ')) {
        continue;
      }
      // If it's not a hunk or header, skip (or handle as 'other' if needed)
      continue;
    }
    if (line.startsWith('+')) {
      currentNewLine++; // Increment before pushing
      result.push({
        type: 'add',
        newLine: currentNewLine,
        content: line.substring(1),
      });
    } else if (line.startsWith('-')) {
      currentOldLine++; // Increment before pushing
      result.push({
        type: 'del',
        oldLine: currentOldLine,
        content: line.substring(1),
      });
    } else if (line.startsWith(' ')) {
      currentOldLine++; // Increment before pushing
      currentNewLine++;
      result.push({
        type: 'context',
        oldLine: currentOldLine,
        newLine: currentNewLine,
        content: line.substring(1),
      });
    } else if (line.startsWith('\\')) {
      // Handle "\ No newline at end of file"
      result.push({ type: 'other', content: line });
    }
  }
  return result;
}

interface DiffRendererProps {
  diffContent: string;
  filename?: string;
  tabWidth?: number;
  availableTerminalHeight?: number;
  terminalWidth: number;
  theme?: Theme;
}

const DEFAULT_TAB_WIDTH = 4; // Spaces per tab for normalization

export const DiffRenderer: React.FC<DiffRendererProps> = ({
  diffContent,
  filename,
  tabWidth = DEFAULT_TAB_WIDTH,
  availableTerminalHeight,
  terminalWidth,
  theme,
}) => {
  const settings = useSettings();

  const screenReaderEnabled = useIsScreenReaderEnabled();

  const parsedLines = useMemo(() => {
    if (!diffContent || typeof diffContent !== 'string') {
      return [];
    }
    return parseDiffWithLineNumbers(diffContent);
  }, [diffContent]);

  const isNewFile = useMemo(() => {
    if (parsedLines.length === 0) return false;
    return parsedLines.every(
      (line) =>
        line.type === 'add' ||
        line.type === 'hunk' ||
        line.type === 'other' ||
        line.content.startsWith('diff --git') ||
        line.content.startsWith('new file mode'),
    );
  }, [parsedLines]);

  const renderedOutput = useMemo(() => {
    if (!diffContent || typeof diffContent !== 'string') {
      return <Text color={semanticTheme.status.warning}>No diff content.</Text>;
    }

    if (parsedLines.length === 0) {
      return (
        <Box
          borderStyle="round"
          borderColor={semanticTheme.border.default}
          padding={1}
        >
          <Text dimColor>No changes detected.</Text>
        </Box>
      );
    }
    if (screenReaderEnabled) {
      return (
        <Box flexDirection="column">
          {parsedLines.map((line, index) => (
            <Text key={index}>
              {line.type}: {line.content}
            </Text>
          ))}
        </Box>
      );
    }

    if (isNewFile) {
      // Extract only the added lines' content
      const addedContent = parsedLines
        .filter((line) => line.type === 'add')
        .map((line) => line.content)
        .join('\n');
      // Attempt to infer language from filename, default to plain text if no filename
      const fileExtension = filename?.split('.').pop() || null;
      const language = fileExtension
        ? getLanguageFromExtension(fileExtension)
        : null;
      return colorizeCode({
        code: addedContent,
        language,
        availableHeight: availableTerminalHeight,
        maxWidth: terminalWidth,
        theme,
        settings,
      });
    } else {
      return renderDiffContent(
        parsedLines,
        filename,
        tabWidth,
        availableTerminalHeight,
        terminalWidth,
      );
    }
  }, [
    diffContent,
    parsedLines,
    screenReaderEnabled,
    isNewFile,
    filename,
    availableTerminalHeight,
    terminalWidth,
    theme,
    settings,
    tabWidth,
  ]);

  return renderedOutput;
};

const renderDiffContent = (
  parsedLines: DiffLine[],
  filename: string | undefined,
  tabWidth = DEFAULT_TAB_WIDTH,
  availableTerminalHeight: number | undefined,
  terminalWidth: number,
) => {
  // 1. Normalize whitespace (replace tabs with spaces) *before* further processing
  const normalizedLines = parsedLines.map((line) => ({
    ...line,
    content: line.content.replace(/\t/g, ' '.repeat(tabWidth)),
  }));

  // Filter out non-displayable lines (hunks, potentially 'other') using the normalized list
  const displayableLines = normalizedLines.filter(
    (l) => l.type !== 'hunk' && l.type !== 'other',
  );

  if (displayableLines.length === 0) {
    return (
      <Box
        borderStyle="round"
        borderColor={semanticTheme.border.default}
        padding={1}
      >
        <Text dimColor>No changes detected.</Text>
      </Box>
    );
  }

  const maxLineNumber = Math.max(
    0,
    ...displayableLines.map((l) => l.oldLine ?? 0),
    ...displayableLines.map((l) => l.newLine ?? 0),
  );
  const gutterWidth = Math.max(1, maxLineNumber.toString().length);

  const fileExtension = filename?.split('.').pop() || null;
  const language = fileExtension
    ? getLanguageFromExtension(fileExtension)
    : null;

  // Calculate the minimum indentation across all displayable lines
  let baseIndentation = Infinity; // Start high to find the minimum
  for (const line of displayableLines) {
    // Only consider lines with actual content for indentation calculation
    if (line.content.trim() === '') continue;

    const firstCharIndex = line.content.search(/\S/); // Find index of first non-whitespace char
    const currentIndent = firstCharIndex === -1 ? 0 : firstCharIndex; // Indent is 0 if no non-whitespace found
    baseIndentation = Math.min(baseIndentation, currentIndent);
  }
  // If baseIndentation remained Infinity (e.g., no displayable lines with content), default to 0
  if (!isFinite(baseIndentation)) {
    baseIndentation = 0;
  }

  const key = filename
    ? `diff-box-${filename}`
    : `diff-box-${crypto.createHash('sha1').update(JSON.stringify(parsedLines)).digest('hex')}`;

  const groupedLines = groupDiffLines(displayableLines);

  let lastLineNumber: number | null = null;
  const MAX_CONTEXT_LINES_WITHOUT_GAP = 5;

  const content = groupedLines.reduce<React.ReactNode[]>(
    (acc, entry, index) => {
      // Determine the relevant line number for gap calculation
      let relevantLineNumberForGapCalc: number | null = null;
      if ('type' in entry && entry.type === 'change') {
        const firstLine = entry.removed[0] || entry.added[0];
        relevantLineNumberForGapCalc =
          (firstLine.type === 'add' ? firstLine.newLine : firstLine.oldLine) ??
          null;
      } else {
        const line = entry;
        if (line.type === 'add' || line.type === 'context') {
          relevantLineNumberForGapCalc = line.newLine ?? null;
        } else if (line.type === 'del') {
          relevantLineNumberForGapCalc = line.oldLine ?? null;
        }
      }

      if (
        lastLineNumber !== null &&
        relevantLineNumberForGapCalc !== null &&
        relevantLineNumberForGapCalc >
          lastLineNumber + MAX_CONTEXT_LINES_WITHOUT_GAP + 1
      ) {
        acc.push(
          <Box key={`gap-${index}`}>
            <Box
              borderStyle="double"
              borderLeft={false}
              borderRight={false}
              borderBottom={false}
              width={terminalWidth}
              borderColor={semanticTheme.text.secondary}
            ></Box>
          </Box>,
        );
      }

      if ('type' in entry && entry.type === 'change') {
        const removedText = entry.removed
          .map((l) => l.content.substring(baseIndentation))
          .join('\n');
        const addedText = entry.added
          .map((l) => l.content.substring(baseIndentation))
          .join('\n');
        const wordDiffs = Diff.diffWordsWithSpace(removedText, addedText);

        // Render removed lines
        const removedLinesParts = renderChangesForType(
          'del',
          wordDiffs,
          semanticTheme.background.diff.removedHighlight,
        );
        entry.removed.forEach((line, i) => {
          const displayContentParts = removedLinesParts[i] || [];
          acc.push(
            renderLine(
              line,
              `del-${index}-${i}`,
              gutterWidth,
              '-',
              semanticTheme.background.diff.removed,
              displayContentParts.length > 0 ? displayContentParts : undefined,
              baseIndentation,
              language,
            ),
          );
          if (line.oldLine !== undefined) {
            lastLineNumber = line.oldLine;
          }
        });

        // Render added lines
        const addedLinesParts = renderChangesForType(
          'add',
          wordDiffs,
          semanticTheme.background.diff.addedHighlight,
        );
        entry.added.forEach((line, i) => {
          const displayContentParts = addedLinesParts[i] || [];
          acc.push(
            renderLine(
              line,
              `add-${index}-${i}`,
              gutterWidth,
              '+',
              semanticTheme.background.diff.added,
              displayContentParts.length > 0 ? displayContentParts : undefined,
              baseIndentation,
              language,
            ),
          );
          lastLineNumber = line.newLine ?? null;
        });
      } else {
        const line = entry;

        let prefixSymbol = ' ';
        let backgroundColor: string | undefined = undefined;

        switch (line.type) {
          case 'add':
            prefixSymbol = '+';
            backgroundColor = semanticTheme.background.diff.added;
            lastLineNumber = line.newLine ?? null;
            break;
          case 'del':
            prefixSymbol = '-';
            backgroundColor = semanticTheme.background.diff.removed;
            if (line.oldLine !== undefined) {
              lastLineNumber = line.oldLine;
            }
            break;
          case 'context':
            prefixSymbol = ' ';
            lastLineNumber = line.newLine ?? null;
            break;
          default:
            break;
        }

        acc.push(
          renderLine(
            line,
            `line-${index}`,
            gutterWidth,
            prefixSymbol,
            backgroundColor,
            undefined,
            baseIndentation,
            language,
          ),
        );
      }
      return acc;
    },
    [],
  );

  return (
    <MaxSizedBox
      maxHeight={availableTerminalHeight}
      maxWidth={terminalWidth}
      key={key}
    >
      {content}
    </MaxSizedBox>
  );
};

const renderLine = (
  line: DiffLine,
  key: string,
  gutterWidth: number,
  prefixSymbol: string,
  backgroundColor: string | undefined,
  displayContentParts: React.ReactNode[] | undefined,
  baseIndentation: number,
  language: string | null,
) => {
  const gutterNumStr =
    (line.type === 'add' || line.type === 'context'
      ? line.newLine
      : line.oldLine
    )?.toString() || '';
  const displayContent = line.content.substring(baseIndentation);

  return (
    <Box key={key} flexDirection="row">
      <Box
        width={gutterWidth + 1}
        paddingRight={1}
        flexShrink={0}
        backgroundColor={backgroundColor}
        justifyContent="flex-end"
      >
        <Text color={semanticTheme.text.secondary}>{gutterNumStr}</Text>
      </Box>
      <Text backgroundColor={backgroundColor} wrap="wrap">
        <Text
          color={
            line.type === 'add'
              ? semanticTheme.status.success
              : line.type === 'del'
                ? semanticTheme.status.error
                : undefined
          }
        >
          {prefixSymbol}
        </Text>{' '}
        {displayContentParts
          ? displayContentParts
          : colorizeLine(displayContent, language)}
      </Text>
    </Box>
  );
};

function renderChangesForType(
  type: 'add' | 'del',
  allChanges: Diff.Change[],
  highlightColor: string | undefined,
) {
  const lines: React.ReactNode[][] = [[]];

  allChanges.forEach((change, changeIndex) => {
    if (type === 'add' && change.removed) return;
    if (type === 'del' && change.added) return;

    const isHighlighted =
      (type === 'add' && change.added) || (type === 'del' && change.removed);
    const color = isHighlighted ? highlightColor : undefined;

    const parts = change.value.split('\n');
    parts.forEach((part, partIndex) => {
      if (partIndex > 0) lines.push([]);
      lines[lines.length - 1].push(
        <Text
          key={`change-${changeIndex}-part-${partIndex}`}
          backgroundColor={color}
        >
          {part}
        </Text>,
      );
    });
  });
  return lines;
}

const getLanguageFromExtension = (extension: string): string | null => {
  const languageMap: { [key: string]: string } = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    json: 'json',
    css: 'css',
    html: 'html',
    sh: 'bash',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    txt: 'plaintext',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    rb: 'ruby',
  };
  return languageMap[extension] || null; // Return null if extension not found
};
