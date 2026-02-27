/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlanEntry } from '@agentclientprotocol/sdk';

/**
 * Parses markdown text to extract a list of task entries matching the ACP PlanEntry format.
 * It ignores content inside code blocks to prevent false positives and strictly matches
 * markdown list items starting with a checkbox or status keyword.
 *
 * @param text The text to parse (usually internal thought text from the LLM).
 * @returns Array of extracted PlanEntry objects or null if no valid plan was found in this block.
 */
export function extractPlanEntries(text: string): PlanEntry[] | null {
  // 1. Strip triple-backtick code blocks to prevent false matches like `// TODO:` inside code.
  //    We match until ```` or end-of-string ($) to handle unclosed blocks during streaming.
  //    We DO NOT strip inline code (`...`) because it might contain valid plan text
  //    (e.g. "- [ ] Run `npm test`") and is unlikely to start a line with a false-positive task.
  const textWithoutCodeBlocks = text.replace(/```[\s\S]*?(?:```|$)/g, '');

  // 2. Match markdown list items: either "- ", "* ", or "1. "
  // followed by a status indicator: [x], [ ], [/], [DONE], [TODO], [IN PROGRESS], etc.
  // The regex is line-anchored (using 'm' flag) to ensure it's a real list item.
  // Group 1: The status string (e.g., "x", " ", "/", "DONE")
  // Group 2: The actual task content
  const taskRegex =
    /^\s*(?:[-*]|\d+\.)\s*\[\s*(x|X|\/| |DONE|TODO|IN_PROGRESS|IN PROGRESS|PENDING|COMPLETED)\s*\]\s+(.*?)$/gm;

  const entries: PlanEntry[] = [];
  let match;

  while ((match = taskRegex.exec(textWithoutCodeBlocks)) !== null) {
    const rawStatus = match[1].toUpperCase().trim();
    const content = match[2].trim();

    if (!content) continue;

    let status: 'pending' | 'in_progress' | 'completed' = 'pending';

    switch (rawStatus) {
      case 'X':
      case 'DONE':
      case 'COMPLETED':
        status = 'completed';
        break;
      case '/':
      case 'IN_PROGRESS':
      case 'IN PROGRESS':
        status = 'in_progress';
        break;
      case '':
      case 'TODO':
      case 'PENDING':
      default:
        status = 'pending';
        break;
    }

    entries.push({ content, status, priority: 'medium' });
  }

  return entries.length > 0 ? entries : null;
}
