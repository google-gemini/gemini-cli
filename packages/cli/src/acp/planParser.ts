/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type PlanEntry } from '@agentclientprotocol/sdk';

/**
 * Extracts plan entries from the provided markdown text.
 * It ignores content within triple-backtick code blocks.
 */
export function extractPlanEntries(text: string): PlanEntry[] | null {
  // 1. Strip triple-backtick code blocks to avoid false positives.
  const textWithoutCodeBlocks = text.replace(/```[\s\S]*?(?:```|$)/g, '');

  // 2. Match markdown list items with task indicators.
  // Supports: - [ ], - [x], - [/], 1. [TODO], 2. [DONE], - [] etc.
  const taskRegex =
    /^\s*(?:[-*]|\d+\.)\s*\[\s*(x|X|\/| |DONE|TODO|IN_PROGRESS|IN PROGRESS|PENDING|COMPLETED)?\s*\]\s+(.*?)$/gm;

  const entries: PlanEntry[] = [];
  let match;

  while ((match = taskRegex.exec(textWithoutCodeBlocks)) !== null) {
    const rawStatus = (match[1] || '').toUpperCase().trim();
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
