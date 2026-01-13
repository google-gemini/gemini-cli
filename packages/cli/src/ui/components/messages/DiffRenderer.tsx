/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import { diffWords, diffChars } from 'diff';
import crypto from 'node:crypto';
import { colorizeCode, colorizeLine } from '../../utils/CodeColorizer.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';
import { theme as semanticTheme } from '../../semantic-colors.js';
import type { Theme } from '../../themes/theme.js';
import { useSettings } from '../../contexts/SettingsContext.js';
import { useAlternateBuffer } from '../../hooks/useAlternateBuffer.js';

interface DiffLine {
  type: 'add' | 'del' | 'context' | 'hunk' | 'other';
  oldLine?: number;
  newLine?: number;
  content: string;
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
  const isAlternateBuffer = useAlternateBuffer();

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
        !isAlternateBuffer,
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
    isAlternateBuffer,
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
  useMaxSizedBox: boolean,
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

  let lastLineNumber: number | null = null;
  const MAX_CONTEXT_LINES_WITHOUT_GAP = 5;

  // Build render items, pairing adjacent deletion and addition lines to enable intra-line highlighting
  type RenderItem =
    | { kind: 'context'; line: DiffLine }
    | { kind: 'add'; line: DiffLine }
    | { kind: 'del'; line: DiffLine }
    | { kind: 'pair'; delLine: DiffLine; addLine: DiffLine };

  const renderItems: RenderItem[] = [];
  for (let i = 0; i < displayableLines.length; i++) {
    const current = displayableLines[i];
    const next = displayableLines[i + 1];
    if (current.type === 'del' && next && next.type === 'add') {
      renderItems.push({ kind: 'pair', delLine: current, addLine: next });
      i++; // skip the paired add line
      continue;
    }
    if (current.type === 'context') {
      renderItems.push({ kind: 'context', line: current });
    } else if (current.type === 'add') {
      renderItems.push({ kind: 'add', line: current });
    } else if (current.type === 'del') {
      renderItems.push({ kind: 'del', line: current });
    }
  }

  // Helper: compute inline diff parts for pair rendering
  function computeInlineParts(oldText: string, newText: string) {
    let parts = diffWords(oldText, newText, { ignoreCase: false });
    if (parts.every((p) => !p.added && !p.removed)) {
      parts = diffChars(oldText, newText);
    }
    return parts;
  }

  return (
    <MaxSizedBox
      maxHeight={availableTerminalHeight}
      maxWidth={terminalWidth}
      key={key}
    >
      {renderItems.reduce<React.ReactNode[]>((acc, item, index) => {
        // Determine the relevant line number for gap calculation based on type
        let relevantLineNumberForGapCalc: number | null = null;
        if (item.kind === 'add' || item.kind === 'context') {
          relevantLineNumberForGapCalc = item.line.newLine ?? null;
        } else if (item.kind === 'del') {
          // For deletions, the gap is typically in relation to the original file's line numbering
          relevantLineNumberForGapCalc = item.line.oldLine ?? null;
        } else if (item.kind === 'pair') {
          // For pairs, use the addition side for gap calculation (consistent with how added/context advance)
          relevantLineNumberForGapCalc = item.addLine.newLine ?? null;
        }

        if (
          lastLineNumber !== null &&
          relevantLineNumberForGapCalc !== null &&
          relevantLineNumberForGapCalc >
            lastLineNumber + MAX_CONTEXT_LINES_WITHOUT_GAP + 1
        ) {
          acc.push(
            <Box key={`gap-${index}`}>
              <Text wrap="truncate" color={semanticTheme.text.secondary}>
                {'═'.repeat(terminalWidth)}
              </Text>
            </Box>,
          );
        }

        const lineKey = `diff-line-${index}`;
        let gutterNumStr = '';
        let prefixSymbol = ' ';

        switch (item.kind) {
          case 'add':
            gutterNumStr = (item.line.newLine ?? '').toString();
            prefixSymbol = '+';
            lastLineNumber = item.line.newLine ?? null;
            break;
          case 'del':
            gutterNumStr = (item.line.oldLine ?? '').toString();
            prefixSymbol = '-';
            // For deletions, update lastLineNumber based on oldLine if it's advancing.
            // This helps manage gaps correctly if there are multiple consecutive deletions
            // or if a deletion is followed by a context line far away in the original file.
            if (item.line.oldLine !== undefined) {
              lastLineNumber = item.line.oldLine;
            }
            break;
          case 'context':
            gutterNumStr = (item.line.newLine ?? '').toString();
            prefixSymbol = ' ';
            lastLineNumber = item.line.newLine ?? null;
            break;
          case 'pair':
            lastLineNumber = item.addLine.newLine ?? null;
            break;
          default:
            return acc;
        }

        // Pair-specific rendering with intra-line highlights
        if (item.kind === 'pair') {
          const delContent = item.delLine.content.substring(baseIndentation);
          const addContent = item.addLine.content.substring(baseIndentation);
          const parts = computeInlineParts(delContent, addContent);

          const delGutter = (item.delLine.oldLine ?? '').toString();
          const addGutter = (item.addLine.newLine ?? '').toString();

          acc.push(
            <Box key={`${lineKey}-del`} flexDirection="row">
              <Text
                color={semanticTheme.text.secondary}
                backgroundColor={semanticTheme.background.diff.removed}
              >
                {delGutter.padStart(gutterWidth)}{' '}
              </Text>
              <Text
                backgroundColor={semanticTheme.background.diff.removed}
                wrap="wrap"
              >
                <Text color={semanticTheme.status.error}>-</Text>{' '}
                {parts.map((p, i) =>
                  p.removed ? (
                    <Text
                      key={`d-${i}`}
                      inverse
                      color={semanticTheme.status.error}
                    >
                      {p.value}
                    </Text>
                  ) : !p.added ? (
                    <Text key={`d-${i}`}>{p.value}</Text>
                  ) : null,
                )}
              </Text>
            </Box>,
          );

          acc.push(
            <Box key={`${lineKey}-add`} flexDirection="row">
              <Text
                color={semanticTheme.text.secondary}
                backgroundColor={semanticTheme.background.diff.added}
              >
                {addGutter.padStart(gutterWidth)}{' '}
              </Text>
              <Text
                backgroundColor={semanticTheme.background.diff.added}
                wrap="wrap"
              >
                <Text color={semanticTheme.status.success}>+</Text>{' '}
                {parts.map((p, i) =>
                  p.added ? (
                    <Text
                      key={`a-${i}`}
                      inverse
                      color={semanticTheme.status.success}
                    >
                      {p.value}
                    </Text>
                  ) : !p.removed ? (
                    <Text key={`a-${i}`}>{p.value}</Text>
                  ) : null,
                )}
              </Text>
            </Box>,
          );
          return acc;
        }

        const displayContent = item.line.content.substring(baseIndentation);

      const lineKey = `diff-line-${index}`;
      let gutterNumStr = '';
      let prefixSymbol = ' ';

      switch (line.type) {
        case 'add':
          gutterNumStr = (line.newLine ?? '').toString();
          prefixSymbol = '+';
          lastLineNumber = line.newLine ?? null;
          break;
        case 'del':
          gutterNumStr = (line.oldLine ?? '').toString();
          prefixSymbol = '-';
          // For deletions, update lastLineNumber based on oldLine if it's advancing.
          // This helps manage gaps correctly if there are multiple consecutive deletions
          // or if a deletion is followed by a context line far away in the original file.
          if (line.oldLine !== undefined) {
            lastLineNumber = line.oldLine;
          }
          break;
        case 'context':
          gutterNumStr = (line.newLine ?? '').toString();
          prefixSymbol = ' ';
          lastLineNumber = line.newLine ?? null;
          break;
        default:
          return acc;
      }

      const displayContent = line.content.substring(baseIndentation);

      const backgroundColor =
        line.type === 'add'
          ? semanticTheme.background.diff.added
          : line.type === 'del'
            ? semanticTheme.background.diff.removed
            : undefined;
      acc.push(
        <Box key={lineKey} flexDirection="row">
          {useMaxSizedBox ? (
            <Text
              color={semanticTheme.text.secondary}
              backgroundColor={backgroundColor}
            >
              {gutterNumStr.padStart(gutterWidth)}{' '}
            </Text>
          ) : (
            <Box
              width={gutterWidth + 1}
              paddingRight={1}
              flexShrink={0}
              backgroundColor={backgroundColor}
              justifyContent="flex-end"
            >
              <Text color={semanticTheme.text.secondary}>{gutterNumStr}</Text>
            </Box>
          )}
          {line.type === 'context' ? (
            <>
              <Text>{prefixSymbol} </Text>
              <Text wrap="wrap">{colorizeLine(displayContent, language)}</Text>
            </>
          ) : (
            <Text
              backgroundColor={
                item.kind === 'add'
                  ? semanticTheme.background.diff.added
                  : item.kind === 'del'
                    ? semanticTheme.background.diff.removed
                    : undefined
              }
              wrap="wrap"
            >
              {gutterNumStr.padStart(gutterWidth)}{' '}
            </Text>
            {item.kind === 'context' ? (
              <>
                <Text>{prefixSymbol} </Text>
                <Text wrap="wrap">
                  {colorizeLine(displayContent, language)}
                </Text>
              </>
            ) : (
              <Text
                backgroundColor={
                  item.kind === 'add'
                    ? semanticTheme.background.diff.added
                    : semanticTheme.background.diff.removed
                }
              >
                <Text
                  color={
                    item.kind === 'add'
                      ? semanticTheme.status.success
                      : semanticTheme.status.error
                  }
                >
                  {prefixSymbol}
                </Text>{' '}
                {colorizeLine(displayContent, language)}
              </Text>
            )}
          </Box>,
        );
        return acc;
      }, [])}
    </MaxSizedBox>
  );
};

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
