/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../colors.js';
import { colorizeCode } from './CodeColorizer.js';

interface MarkdownDisplayProps {
  text: string;
}

function MarkdownDisplayComponent({
  text,
}: MarkdownDisplayProps): React.ReactElement {
  if (!text) return <></>;

  const lines = text.split('\n');
  const headerRegex = /^ *(#{1,4}) +(.*)/;
  const codeFenceRegex = /^ *(`{3,}|~{3,}) *(\S*?) *$/;
  const ulItemRegex = /^([ \t]*)([-*+]) +(.*)/;
  const olItemRegex = /^([ \t]*)(\d+)\. +(.*)/;
  const hrRegex = /^ *([-*_] *){3,} *$/;

  const contentBlocks: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang: string | null = null;
  let codeBlockFence = '';

  lines.forEach((line, index) => {
    const key = `line-${index}`;

    if (inCodeBlock) {
      const fenceMatch = line.match(codeFenceRegex);
      if (
        fenceMatch &&
        fenceMatch[1].startsWith(codeBlockFence[0]) &&
        fenceMatch[1].length >= codeBlockFence.length
      ) {
        contentBlocks.push(
          _renderCodeBlock(key, codeBlockContent, codeBlockLang),
        );
        inCodeBlock = false;
        codeBlockContent = [];
        codeBlockLang = null;
        codeBlockFence = '';
      } else {
        codeBlockContent.push(line);
      }
      return;
    }

    const codeFenceMatch = line.match(codeFenceRegex);
    const headerMatch = line.match(headerRegex);
    const ulMatch = line.match(ulItemRegex);
    const olMatch = line.match(olItemRegex);
    const hrMatch = line.match(hrRegex);

    if (codeFenceMatch) {
      inCodeBlock = true;
      codeBlockFence = codeFenceMatch[1];
      codeBlockLang = codeFenceMatch[2] || null;
    } else if (hrMatch) {
      contentBlocks.push(
        <Box key={key}>
          <Text dimColor>---</Text>
        </Box>,
      );
    } else if (headerMatch) {
      const level = headerMatch[1].length;
      const headerText = headerMatch[2];
      const renderedHeaderText = _renderInline(headerText);
      let headerNode: React.ReactNode = null;
      switch (level) {
        case 1:
          headerNode = (
            <Text bold color={Colors.AccentCyan}>
              {renderedHeaderText}
            </Text>
          );
          break;
        case 2:
          headerNode = (
            <Text bold color={Colors.AccentBlue}>
              {renderedHeaderText}
            </Text>
          );
          break;
        case 3:
          headerNode = <Text bold>{renderedHeaderText}</Text>;
          break;
        case 4:
          headerNode = (
            <Text italic color={Colors.SubtleComment}>
              {renderedHeaderText}
            </Text>
          );
          break;
        default:
          headerNode = <Text>{renderedHeaderText}</Text>;
          break;
      }
      if (headerNode) contentBlocks.push(<Box key={key}>{headerNode}</Box>);
    } else if (ulMatch) {
      const leadingWhitespace = ulMatch[1];
      const marker = ulMatch[2];
      const itemText = ulMatch[3];
      contentBlocks.push(
        _renderListItem(key, itemText, 'ul', marker, leadingWhitespace),
      );
    } else if (olMatch) {
      const leadingWhitespace = olMatch[1];
      const marker = olMatch[2];
      const itemText = olMatch[3];
      contentBlocks.push(
        _renderListItem(key, itemText, 'ol', marker, leadingWhitespace),
      );
    } else {
      const renderedLine = _renderInline(line);
      if (renderedLine.length > 0 || line.length > 0) {
        contentBlocks.push(
          <Box key={key}>
            <Text wrap="wrap">{renderedLine}</Text>
          </Box>,
        );
      } else if (line.trim().length === 0) {
        if (contentBlocks.length > 0 && !inCodeBlock) {
          contentBlocks.push(<Box key={key} height={1} />);
        }
      }
    }
  });

  if (inCodeBlock) {
    contentBlocks.push(
      _renderCodeBlock(`line-eof`, codeBlockContent, codeBlockLang),
    );
  }

  return <>{contentBlocks}</>;
}

// Helper functions (adapted from static methods of MarkdownRenderer)

function _renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  const inlineRegex =
    /(\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>)/g;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Text key={`t-${lastIndex}`}>
          {text.slice(lastIndex, match.index)}
        </Text>,
      );
    }

    const fullMatch = match[0];
    let renderedNode: React.ReactNode = null;
    const key = `m-${match.index}`;

    try {
      if (
        fullMatch.startsWith('**') &&
        fullMatch.endsWith('**') &&
        fullMatch.length > 4
      ) {
        renderedNode = (
          <Text key={key} bold>
            {fullMatch.slice(2, -2)}
          </Text>
        );
      } else if (
        ((fullMatch.startsWith('*') && fullMatch.endsWith('*')) ||
          (fullMatch.startsWith('_') && fullMatch.endsWith('_'))) &&
        fullMatch.length > 2
      ) {
        renderedNode = (
          <Text key={key} italic>
            {fullMatch.slice(1, -1)}
          </Text>
        );
      } else if (
        fullMatch.startsWith('~~') &&
        fullMatch.endsWith('~~') &&
        fullMatch.length > 4
      ) {
        renderedNode = (
          <Text key={key} strikethrough>
            {fullMatch.slice(2, -2)}
          </Text>
        );
      } else if (
        fullMatch.startsWith('`') &&
        fullMatch.endsWith('`') &&
        fullMatch.length > 1
      ) {
        const codeMatch = fullMatch.match(/^(`+)(.+?)\1$/s);
        if (codeMatch && codeMatch[2]) {
          renderedNode = (
            <Text key={key} color={Colors.AccentPurple}>
              {codeMatch[2]}
            </Text>
          );
        } else {
          renderedNode = (
            <Text key={key} color={Colors.AccentPurple}>
              {fullMatch.slice(1, -1)}
            </Text>
          );
        }
      } else if (
        fullMatch.startsWith('[') &&
        fullMatch.includes('](') &&
        fullMatch.endsWith(')')
      ) {
        const linkMatch = fullMatch.match(/\[(.*?)\]\((.*?)\)/);
        if (linkMatch) {
          const linkText = linkMatch[1];
          const url = linkMatch[2];
          renderedNode = (
            <Text key={key}>
              {linkText}
              <Text color={Colors.AccentBlue}> ({url})</Text>
            </Text>
          );
        }
      } else if (
        fullMatch.startsWith('<u>') &&
        fullMatch.endsWith('</u>') &&
        fullMatch.length > 6
      ) {
        renderedNode = (
          <Text key={key} underline>
            {fullMatch.slice(3, -4)}
          </Text>
        );
      }
    } catch (e) {
      console.error('Error parsing inline markdown part:', fullMatch, e);
      renderedNode = null;
    }

    nodes.push(renderedNode ?? <Text key={key}>{fullMatch}</Text>);
    lastIndex = inlineRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(<Text key={`t-${lastIndex}`}>{text.slice(lastIndex)}</Text>);
  }

  return nodes.filter((node) => node !== null);
}

function _renderCodeBlock(
  key: string,
  content: string[],
  lang: string | null,
): React.ReactNode {
  const fullContent = content.join('\n');
  const colorizedCode = colorizeCode(fullContent, lang);

  return (
    <Box key={key} flexDirection="column" padding={1}>
      {colorizedCode}
    </Box>
  );
}

function _renderListItem(
  key: string,
  text: string,
  type: 'ul' | 'ol',
  marker: string,
  leadingWhitespace: string = '',
): React.ReactNode {
  const renderedText = _renderInline(text);
  const prefix = type === 'ol' ? `${marker}. ` : `${marker} `;
  const prefixWidth = prefix.length;
  const indentation = leadingWhitespace.length;

  return (
    <Box key={key} paddingLeft={indentation + 1} flexDirection="row">
      <Box width={prefixWidth}>
        <Text>{prefix}</Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap">{renderedText}</Text>
      </Box>
    </Box>
  );
}

export const MarkdownDisplay = React.memo(MarkdownDisplayComponent);
