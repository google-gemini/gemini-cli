/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fsPromises from 'node:fs/promises';
import { debugLogger } from '../utils/debugLogger.js';
import {
  MAX_LINE_LENGTH_TEXT_FILE,
  MAX_STORED_TOOL_OUTPUT_BYTES,
} from '../utils/constants.js';
import type { GrepResult } from './tools.js';

/**
 * Upper bound on the characters a single grep result sends to the model.
 *
 * The match cap alone doesn't bound the size: 100 matches of 2000-character
 * lines is 200K characters. This keeps a broad search in line with the default
 * tool output truncation threshold (40K characters), so grep output is cut on
 * a whole line with a hint to narrow the search instead of mid-line by the
 * generic truncation.
 */
export const MAX_GREP_OUTPUT_CHARS = 40_000;

/**
 * Upper bound on the UTF-8 bytes of a single grep result.
 *
 * The tool executor cuts any output over MAX_STORED_TOOL_OUTPUT_BYTES from the
 * end. A character can take up to 4 bytes, so 40K characters of Japanese text
 * or emoji is well over that, and the executor's cut would drop the notice
 * that says how many matches were shown and how to narrow the search.
 */
export const MAX_GREP_OUTPUT_BYTES = MAX_STORED_TOOL_OUTPUT_BYTES;

// Room kept free under both limits for the truncation notice, which is ASCII.
const TRUNCATION_NOTICE_RESERVE = 500;

const FILE_SEPARATOR = '---\n';

/** The size of a piece of output, in characters and in UTF-8 bytes. */
interface OutputSize {
  chars: number;
  bytes: number;
}

function sizeOf(text: string): OutputSize {
  return { chars: text.length, bytes: Buffer.byteLength(text, 'utf8') };
}

function addSize(a: OutputSize, b: OutputSize): OutputSize {
  return { chars: a.chars + b.chars, bytes: a.bytes + b.bytes };
}

/** Whether the pieces together stay within both limits of `budget`. */
function fits(budget: OutputSize, ...pieces: OutputSize[]): boolean {
  const total = pieces.reduce(addSize, { chars: 0, bytes: 0 });
  return total.chars <= budget.chars && total.bytes <= budget.bytes;
}

const FILE_SEPARATOR_SIZE = sizeOf(FILE_SEPARATOR);

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
 * grow past either limit of `budget`.
 */
function renderMatchGroups(
  matchesByFile: Record<string, GrepMatch[]>,
  budget: OutputSize,
  includeContext: boolean,
): { text: string; shownMatches: number; truncated: boolean } {
  let text = '';
  let textSize: OutputSize = { chars: 0, bytes: 0 };
  let shownMatches = 0;
  for (const filePath in matchesByFile) {
    let fileBlock = `File: ${filePath}\n`;
    let blockSize = sizeOf(fileBlock);
    let fileHasLines = false;
    let truncated = false;
    for (const match of matchesByFile[filePath]) {
      if (match.isContext && !includeContext) {
        continue;
      }
      const line = formatMatchLine(match);
      const lineSize = sizeOf(line);
      if (!fits(budget, textSize, blockSize, lineSize, FILE_SEPARATOR_SIZE)) {
        truncated = true;
        break;
      }
      fileBlock += line;
      blockSize = addSize(blockSize, lineSize);
      fileHasLines = true;
      if (!match.isContext) {
        shownMatches++;
      }
    }
    if (fileHasLines) {
      text += fileBlock + FILE_SEPARATOR;
      textSize = addSize(textSize, addSize(blockSize, FILE_SEPARATOR_SIZE));
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
    return `\n[Context lines were left out to stay under the output size limit. Read the file around a match to see its surroundings.]`;
  }
  return (
    `\n[Output truncated: showing ${shown} of ${total} ${unit}${contextOmitted ? ' without context lines' : ''} to stay under the output size limit. ` +
    `This search is too broad to read in full. Narrow the search with a more specific pattern` +
    (unit === 'files'
      ? ` or an 'include_pattern' or a 'dir_path'.]`
      : `, an 'include_pattern' or a 'dir_path', or set 'names_only' to see which files match first.]`)
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
  const outputBudget: OutputSize = {
    chars: MAX_GREP_OUTPUT_CHARS - TRUNCATION_NOTICE_RESERVE,
    bytes: MAX_GREP_OUTPUT_BYTES - TRUNCATION_NOTICE_RESERVE,
  };

  if (names_only) {
    const filePaths = Object.keys(matchesByFile).sort();
    let llmContent = `Found ${filePaths.length} files with matches for pattern "${pattern}" ${searchLocationDescription}${
      include_pattern ? ` (filter: "${include_pattern}")` : ''
    }${
      wasTruncated
        ? ` (results limited to ${totalMaxMatches} matches for performance)`
        : ''
    }:\n`;
    let contentSize = sizeOf(llmContent);
    let shownFiles = 0;
    for (const filePath of filePaths) {
      const entry = `${filePath}\n`;
      const entrySize = sizeOf(entry);
      if (!fits(outputBudget, contentSize, entrySize)) {
        break;
      }
      llmContent += entry;
      contentSize = addSize(contentSize, entrySize);
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

  const headerSize = sizeOf(llmContent);
  const bodyBudget: OutputSize = {
    chars: outputBudget.chars - headerSize.chars,
    bytes: outputBudget.bytes - headerSize.bytes,
  };
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
