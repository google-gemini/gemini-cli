/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fsPromises from 'node:fs/promises';
import { debugLogger } from '../utils/debugLogger.js';
import { MAX_LINE_LENGTH_TEXT_FILE } from '../utils/constants.js';
import type { GrepResult } from './tools.js';

/**
 * Upper bound on the characters a single grep result sends to the model.
 *
 * The match cap alone doesn't bound the size: 100 matches of 2000-character
 * lines is 200K characters. This keeps a broad search in line with the default
 * tool output truncation threshold (40K characters) and under the tool
 * executor's MAX_STORED_TOOL_OUTPUT_BYTES, so grep output is cut on a whole
 * line with a hint to narrow the search instead of mid-line by the generic
 * truncation.
 */
export const MAX_GREP_OUTPUT_CHARS = 40_000;

// Room kept free under MAX_GREP_OUTPUT_CHARS for the truncation notice.
const TRUNCATION_NOTICE_RESERVE_CHARS = 500;

const FILE_SEPARATOR = '---\n';

/**
 * Result object for a single grep match
 */
export interface GrepMatch {
  filePath: string;
  absolutePath: string;
  lineNumber: number;
  line: string;
  isContext?: boolean;
}

function formatMatchLine(match: GrepMatch): string {
  // If isContext is undefined, assume it's a match (false)
  const separator = match.isContext ? '-' : ':';
  // trimEnd to avoid double newlines if line has them, but we want to preserve indentation
  let lineContent = match.line.trimEnd();
  const graphemes = Array.from(lineContent);
  if (graphemes.length > MAX_LINE_LENGTH_TEXT_FILE) {
    lineContent =
      graphemes.slice(0, MAX_LINE_LENGTH_TEXT_FILE).join('') +
      '... [truncated]';
  }
  return `L${match.lineNumber}${separator} ${lineContent}\n`;
}

/**
 * Renders grouped matches, stopping on a whole line before the text would
 * grow past `budget` characters.
 */
function renderMatchGroups(
  matchesByFile: Record<string, GrepMatch[]>,
  budget: number,
  includeContext: boolean,
): { text: string; shownMatches: number; truncated: boolean } {
  let text = '';
  let shownMatches = 0;
  for (const filePath in matchesByFile) {
    let fileBlock = `File: ${filePath}\n`;
    let fileHasLines = false;
    let truncated = false;
    for (const match of matchesByFile[filePath]) {
      if (match.isContext && !includeContext) {
        continue;
      }
      const line = formatMatchLine(match);
      if (
        text.length + fileBlock.length + line.length + FILE_SEPARATOR.length >
        budget
      ) {
        truncated = true;
        break;
      }
      fileBlock += line;
      fileHasLines = true;
      if (!match.isContext) {
        shownMatches++;
      }
    }
    if (fileHasLines) {
      text += fileBlock + FILE_SEPARATOR;
    }
    if (truncated) {
      return { text, shownMatches, truncated };
    }
  }
  return { text, shownMatches, truncated: false };
}

function formatTruncationNotice(
  shown: number,
  total: number,
  unit: string,
  contextOmitted = false,
): string {
  if (shown >= total) {
    return `\n[Context lines were left out to stay under ${MAX_GREP_OUTPUT_CHARS} characters. Read the file around a match to see its surroundings.]`;
  }
  return (
    `\n[Output truncated: showing ${shown} of ${total} ${unit}${contextOmitted ? ' without context lines' : ''} to stay under ${MAX_GREP_OUTPUT_CHARS} characters. ` +
    `This search is too broad to read in full. Narrow the search with a more specific pattern, ` +
    `an 'include_pattern' or a 'dir_path', or set 'names_only' to see which files match first.]`
  );
}

/**
 * Groups matches by their file path and ensures they are sorted by line number.
 */
export function groupMatchesByFile(
  allMatches: GrepMatch[],
): Record<string, GrepMatch[]> {
  const groups: Record<string, GrepMatch[]> = {};

  for (const match of allMatches) {
    if (!groups[match.filePath]) {
      groups[match.filePath] = [];
    }
    groups[match.filePath].push(match);
  }

  for (const filePath in groups) {
    groups[filePath].sort((a, b) => a.lineNumber - b.lineNumber);
  }

  return groups;
}

/**
 * Reads the content of a file and splits it into lines.
 * Returns null if the file cannot be read.
 */
export async function readFileLines(
  absolutePath: string,
): Promise<string[] | null> {
  try {
    const content = await fsPromises.readFile(absolutePath, 'utf8');
    return content.split(/\r?\n/);
  } catch (err) {
    debugLogger.warn(`Failed to read file for context: ${absolutePath}`, err);
    return null;
  }
}

/**
 * Automatically enriches grep results with surrounding context if the match count is low
 * and no specific context was requested. This optimization can enable the agent
 * to skip turns that would be spent reading files after grep calls.
 */
export async function enrichWithAutoContext(
  matchesByFile: Record<string, GrepMatch[]>,
  matchCount: number,
  params: {
    names_only?: boolean;
    context?: number;
    before?: number;
    after?: number;
  },
): Promise<void> {
  const { names_only, context, before, after } = params;

  if (
    matchCount >= 1 &&
    matchCount <= 3 &&
    !names_only &&
    context === undefined &&
    before === undefined &&
    after === undefined
  ) {
    const contextLines = matchCount === 1 ? 50 : 15;
    for (const filePath in matchesByFile) {
      const fileMatches = matchesByFile[filePath];
      if (fileMatches.length === 0) continue;

      const fileLines = await readFileLines(fileMatches[0].absolutePath);

      if (fileLines) {
        const newFileMatches: GrepMatch[] = [];
        const seenLines = new Set<number>();

        // Sort matches to process them in order
        fileMatches.sort((a, b) => a.lineNumber - b.lineNumber);

        for (const match of fileMatches) {
          const startLine = Math.max(0, match.lineNumber - 1 - contextLines);
          const endLine = Math.min(
            fileLines.length,
            match.lineNumber - 1 + contextLines + 1,
          );

          for (let i = startLine; i < endLine; i++) {
            const lineNum = i + 1;
            if (!seenLines.has(lineNum)) {
              newFileMatches.push({
                absolutePath: match.absolutePath,
                filePath: match.filePath,
                lineNumber: lineNum,
                line: fileLines[i],
                isContext: lineNum !== match.lineNumber,
              });
              seenLines.add(lineNum);
            } else if (lineNum === match.lineNumber) {
              const existing = newFileMatches.find(
                (m) => m.lineNumber === lineNum,
              );
              if (existing) {
                existing.isContext = false;
              }
            }
          }
        }
        matchesByFile[filePath] = newFileMatches.sort(
          (a, b) => a.lineNumber - b.lineNumber,
        );
      }
    }
  }
}

/**
 * Formats the grep results for the LLM, including optional context.
 */
export async function formatGrepResults(
  allMatches: GrepMatch[],
  params: {
    pattern: string;
    names_only?: boolean;
    include_pattern?: string;
    // Context params to determine if auto-context should be skipped
    context?: number;
    before?: number;
    after?: number;
  },
  searchLocationDescription: string,
  totalMaxMatches: number,
): Promise<{ llmContent: string; returnDisplay: GrepResult }> {
  const { pattern, names_only, include_pattern } = params;

  if (allMatches.length === 0) {
    const noMatchMsg = `No matches found for pattern "${pattern}" ${searchLocationDescription}${include_pattern ? ` (filter: "${include_pattern}")` : ''}.`;
    return {
      llmContent: noMatchMsg,
      returnDisplay: {
        summary: 'No matches found',
        matches: [],
      },
    };
  }

  const matchesByFile = groupMatchesByFile(allMatches);

  const matchesOnly = allMatches.filter((m) => !m.isContext);
  const matchCount = matchesOnly.length; // Count actual matches, not context lines
  const matchTerm = matchCount === 1 ? 'match' : 'matches';

  // If the result count is low and Gemini didn't request before/after lines of context
  // add a small amount anyways to enable the agent to avoid one or more extra turns
  // reading the matched files. This optimization reduces turns count by ~10% in SWEBench.
  await enrichWithAutoContext(matchesByFile, matchCount, params);

  const wasTruncated = matchCount >= totalMaxMatches;
  const outputBudget = MAX_GREP_OUTPUT_CHARS - TRUNCATION_NOTICE_RESERVE_CHARS;

  if (names_only) {
    const filePaths = Object.keys(matchesByFile).sort();
    let llmContent = `Found ${filePaths.length} files with matches for pattern "${pattern}" ${searchLocationDescription}${
      include_pattern ? ` (filter: "${include_pattern}")` : ''
    }${
      wasTruncated
        ? ` (results limited to ${totalMaxMatches} matches for performance)`
        : ''
    }:\n`;
    let shownFiles = 0;
    for (const filePath of filePaths) {
      if (llmContent.length + filePath.length + 1 > outputBudget) {
        break;
      }
      llmContent += `${filePath}\n`;
      shownFiles++;
    }
    const sizeLimited = shownFiles < filePaths.length;
    if (sizeLimited) {
      llmContent += formatTruncationNotice(
        shownFiles,
        filePaths.length,
        'files',
      );
    }
    return {
      llmContent: llmContent.trim(),
      returnDisplay: {
        summary: `Found ${filePaths.length} files${wasTruncated || sizeLimited ? ' (limited)' : ''}`,
        matches: [],
      },
    };
  }

  let llmContent = `Found ${matchCount} ${matchTerm} for pattern "${pattern}" ${searchLocationDescription}${include_pattern ? ` (filter: "${include_pattern}")` : ''}`;

  if (wasTruncated) {
    llmContent += ` (results limited to ${totalMaxMatches} matches for performance)`;
  }

  llmContent += `:\n---\n`;

  const bodyBudget = outputBudget - llmContent.length;
  let rendered = renderMatchGroups(matchesByFile, bodyBudget, true);
  let contextOmitted = false;
  // If the full output doesn't fit, drop context lines before dropping
  // matches, so the matches themselves are what the model gets to see.
  if (
    rendered.truncated &&
    Object.values(matchesByFile).some((fileMatches) =>
      fileMatches.some((m) => m.isContext),
    )
  ) {
    rendered = renderMatchGroups(matchesByFile, bodyBudget, false);
    contextOmitted = true;
  }
  llmContent += rendered.text;

  if (contextOmitted || rendered.truncated) {
    llmContent += formatTruncationNotice(
      rendered.shownMatches,
      matchCount,
      matchTerm,
      contextOmitted,
    );
  }

  return {
    llmContent: llmContent.trim(),
    returnDisplay: {
      summary: `Found ${matchCount} ${matchTerm}${wasTruncated || rendered.truncated ? ' (limited)' : ''}`,
      matches: allMatches
        .filter((m) => !m.isContext)
        .map((m) => ({
          filePath: m.filePath,
          absolutePath: m.absolutePath,
          lineNumber: m.lineNumber,
          line: m.line,
        })),
    },
  };
}
