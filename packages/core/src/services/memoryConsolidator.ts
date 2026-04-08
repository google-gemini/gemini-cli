/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview LLM-powered memory consolidation that reads recent session
 * logs and updates GEMINI.md files with extracted insights. Protects
 * user-authored sections and deduplicates against existing content.
 *
 * Designed to run in a background worker thread after session end.
 */

import * as fs from 'node:fs/promises';
import { debugLogger } from '../utils/debugLogger.js';
import type { SessionLogEntry } from './sessionLogTypes.js';

/** The section header that delimits user-authored vs. Gemini-managed content. */
export const GEMINI_SECTION_MARKER = '## Gemini Added Memories';

/** Maximum number of recent entries to send to the LLM for consolidation. */
const MAX_ENTRIES_FOR_CONSOLIDATION = 50;

/** Maximum tokens worth of session context (~4 chars per token estimate). */
const MAX_CONTEXT_CHARS = 20_000;

/**
 * Describes the result of a consolidation attempt.
 */
export interface ConsolidationResult {
  /** Whether the GEMINI.md file was actually modified. */
  modified: boolean;
  /** Number of new insights extracted. */
  insightsCount: number;
  /** Error message if consolidation failed. */
  error?: string;
}

/**
 * Interface for the LLM client used by the consolidator.
 * Matches the BaseLlmClient pattern in the codebase.
 */
export interface ConsolidationLlmClient {
  generateContent(prompt: string): Promise<string>;
}

/**
 * MemoryConsolidator reads recent session logs, sends them to Gemini Flash
 * for analysis, and merges extracted insights into the GEMINI.md file.
 *
 * Key invariants:
 * - User-authored content above `## Gemini Added Memories` is NEVER modified.
 * - Duplicate insights are detected and skipped.
 * - The consolidator operates on a single GEMINI.md file at a time.
 */
export class MemoryConsolidator {
  constructor(private readonly llmClient: ConsolidationLlmClient) {}

  /**
   * Runs consolidation for a single project.
   *
   * @param geminiMdPath Path to the GEMINI.md file to update.
   * @param recentEntries Recent session log entries to analyze.
   * @returns The result of the consolidation attempt.
   */
  async consolidate(
    geminiMdPath: string,
    recentEntries: SessionLogEntry[],
  ): Promise<ConsolidationResult> {
    if (recentEntries.length === 0) {
      return { modified: false, insightsCount: 0 };
    }

    try {
      // 1. Read current GEMINI.md content
      let currentContent: string;
      try {
        currentContent = await fs.readFile(geminiMdPath, 'utf-8');
      } catch {
        return {
          modified: false,
          insightsCount: 0,
          error: `GEMINI.md not found at ${geminiMdPath}`,
        };
      }

      // 2. Extract the Gemini-managed section
      const { userSection, geminiSection } = splitSections(currentContent);

      // 3. Prepare session context (truncated for token budget)
      const sessionContext = prepareSessionContext(recentEntries);

      // 4. Ask the LLM to extract new insights
      const prompt = buildConsolidationPrompt(
        userSection,
        geminiSection,
        sessionContext,
      );
      const llmResponse = await this.llmClient.generateContent(prompt);

      // 5. Parse the LLM response for new insights
      const newInsights = parseInsights(llmResponse);
      if (newInsights.length === 0) {
        return { modified: false, insightsCount: 0 };
      }

      // 6. Deduplicate against existing Gemini section
      const deduplicated = deduplicateInsights(newInsights, geminiSection);
      if (deduplicated.length === 0) {
        return { modified: false, insightsCount: 0 };
      }

      // 7. Merge and write back
      const updatedGeminiSection = mergeInsights(geminiSection, deduplicated);
      const updatedContent = rebuildContent(userSection, updatedGeminiSection);

      await fs.writeFile(geminiMdPath, updatedContent, 'utf-8');

      debugLogger.debug(
        `[MemoryConsolidator] Added ${deduplicated.length} insight(s) to ${geminiMdPath}`,
      );

      return { modified: true, insightsCount: deduplicated.length };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      debugLogger.warn(`[MemoryConsolidator] Failed: ${msg}`);
      return { modified: false, insightsCount: 0, error: msg };
    }
  }
}

/**
 * Splits GEMINI.md content into the user-authored section and the
 * Gemini-managed section.
 */
export function splitSections(content: string): {
  userSection: string;
  geminiSection: string;
} {
  const markerIndex = content.indexOf(GEMINI_SECTION_MARKER);
  if (markerIndex === -1) {
    return { userSection: content, geminiSection: '' };
  }

  const userSection = content.slice(0, markerIndex).trimEnd();
  const afterMarker = content.slice(markerIndex + GEMINI_SECTION_MARKER.length);

  // Skip the leading newline(s) and any HTML comment on the first line
  let startIndex = 0;

  // Skip leading whitespace/newlines
  while (
    startIndex < afterMarker.length &&
    /[\s\n]/.test(afterMarker[startIndex])
  ) {
    startIndex++;
  }

  // Skip if the first non-whitespace content is an HTML comment
  const remaining = afterMarker.slice(startIndex);
  if (remaining.startsWith('<!--')) {
    const commentEndIndex = remaining.indexOf('-->');
    if (commentEndIndex !== -1) {
      // Skip past the comment and any trailing newline
      startIndex += commentEndIndex + 3;
      while (
        startIndex < afterMarker.length &&
        /[\s\n]/.test(afterMarker[startIndex])
      ) {
        startIndex++;
      }
    }
  }

  const geminiSection = afterMarker.slice(startIndex).trim();
  return { userSection, geminiSection };
}

/**
 * Prepares a compact summary of recent session entries for the LLM.
 */
function prepareSessionContext(entries: SessionLogEntry[]): string {
  const selected = entries.slice(-MAX_ENTRIES_FOR_CONSOLIDATION);
  const lines: string[] = [];
  let totalChars = 0;

  for (const entry of selected) {
    const line =
      `[${entry.timestamp}] ${entry.summary}` +
      (entry.filesModified.length > 0
        ? ` (files: ${entry.filesModified.join(', ')})`
        : '');
    if (totalChars + line.length > MAX_CONTEXT_CHARS) break;
    lines.push(line);
    totalChars += line.length;
  }

  return lines.join('\n');
}

/**
 * Builds the prompt for the consolidation LLM call.
 */
function buildConsolidationPrompt(
  _userSection: string,
  existingMemories: string,
  sessionContext: string,
): string {
  return `You are a memory consolidation system. Analyze the following recent session activity and extract new, lasting insights that would be useful for future coding sessions on this project.

## Existing Memories
${existingMemories || '(none yet)'}

## Recent Session Activity
${sessionContext}

## Instructions
1. Extract concise, actionable insights about the project that aren't already captured in existing memories.
2. Focus on: architecture patterns, recurring workflows, important file locations, naming conventions, and frequently used commands.
3. Skip transient information (temporary debugging, one-off tasks).
4. Return insights as a markdown bullet list, one per line. Use \`- \` prefix.
5. If no new insights are worth adding, return exactly: NO_NEW_INSIGHTS
6. Keep each insight to a single, concise line.
7. Do not repeat existing memories.`;
}

/**
 * Parses the LLM response into individual insight strings.
 */
export function parseInsights(response: string): string[] {
  if (response.includes('NO_NEW_INSIGHTS')) {
    return [];
  }

  return response
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0);
}

/**
 * Removes insights that are semantically similar to existing content.
 * Uses simple substring matching — good enough for deduplication without
 * an embedding model.
 */
export function deduplicateInsights(
  newInsights: string[],
  existingContent: string,
): string[] {
  const existingLower = existingContent.toLowerCase();

  return newInsights.filter((insight) => {
    // Extract key terms (words > 4 chars) for fuzzy matching
    const keyTerms = insight
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);

    // If >70% of key terms already appear in existing content, skip
    if (keyTerms.length > 0) {
      const matchCount = keyTerms.filter((term) =>
        existingLower.includes(term),
      ).length;
      const matchRatio = matchCount / keyTerms.length;
      if (matchRatio > 0.7) return false;
    }

    return true;
  });
}

/**
 * Appends new insights to the existing Gemini section.
 */
function mergeInsights(existingSection: string, newInsights: string[]): string {
  const newLines = newInsights.map((i) => `- ${i}`).join('\n');
  if (existingSection.trim()) {
    return `${existingSection.trimEnd()}\n${newLines}`;
  }
  return newLines;
}

/**
 * Rebuilds the full GEMINI.md content from its sections.
 */
function rebuildContent(userSection: string, geminiSection: string): string {
  return `${userSection}

${GEMINI_SECTION_MARKER}
<!-- Gemini will add learned context below this line. Do not remove this section. -->
${geminiSection}
`;
}
