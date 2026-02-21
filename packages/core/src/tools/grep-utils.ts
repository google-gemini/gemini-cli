/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fsPromises from 'node:fs/promises';
import { debugLogger } from '../utils/debugLogger.js';

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
    include?: string;
    // Context params to determine if auto-context should be skipped
    context?: number;
    before?: number;
    after?: number;
  },
  searchLocationDescription: string,
  totalMaxMatches: number,
): Promise<{ llmContent: string; returnDisplay: string }> {
  const { pattern, names_only, include } = params;

  if (allMatches.length === 0) {
    const noMatchMsg = `No matches found for pattern "${pattern}" ${searchLocationDescription}${include ? ` (filter: "${include}")` : ''}.`;
    return { llmContent: noMatchMsg, returnDisplay: `No matches found` };
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

  if (names_only) {
    const filePaths = Object.keys(matchesByFile).sort();
    let llmContent = `Found ${filePaths.length} files with matches for pattern "${pattern}" ${searchLocationDescription}${
      include ? ` (filter: "${include}")` : ''
    }${
      wasTruncated
        ? ` (results limited to ${totalMaxMatches} matches for performance)`
        : ''
    }:\n`;
    llmContent += filePaths.join('\n');
    return {
      llmContent: llmContent.trim(),
      returnDisplay: `Found ${filePaths.length} files${wasTruncated ? ' (limited)' : ''}`,
    };
  }

  let llmContent = `Found ${matchCount} ${matchTerm} for pattern "${pattern}" ${searchLocationDescription}${include ? ` (filter: "${include}")` : ''}`;

  if (wasTruncated) {
    llmContent += ` (results limited to ${totalMaxMatches} matches for performance)`;
  }

  llmContent += `:\n---\n`;

  for (const filePath in matchesByFile) {
    llmContent += `File: ${filePath}\n`;
    matchesByFile[filePath].forEach((match) => {
      // If isContext is undefined, assume it's a match (false)
      const separator = match.isContext ? '-' : ':';
      // trimEnd to avoid double newlines if line has them, but we want to preserve indentation
      llmContent += `L${match.lineNumber}${separator} ${match.line.trimEnd()}\n`;
    });
    llmContent += '---\n';
  }

  return {
    llmContent: llmContent.trim(),
    returnDisplay: `Found ${matchCount} ${matchTerm}${
      wasTruncated ? ' (limited)' : ''
    }`,
  };
}
