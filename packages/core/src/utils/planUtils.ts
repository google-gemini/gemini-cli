/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { marked } from 'marked';
import { type Todo, type TodoStatus } from '../tools/tools.js';

interface MarkedToken {
  type: string;
  raw: string;
  tokens?: MarkedToken[];
  items?: MarkedToken[];
}

/**
 * Parses markdown content to extract task lists and convert them to Todo items.
 *
 * Supported markers:
 * - [ ] -> pending
 * - [x], [X] -> completed
 * - [/], [>] -> in_progress
 * - [-] -> cancelled
 *
 * @param content The markdown content to parse.
 * @returns An array of Todo items.
 */
export function parseMarkdownTodos(content: string): Todo[] {
  const tokens = marked.lexer(content) as unknown as MarkedToken[];
  const todos: Todo[] = [];

  const walk = (token: MarkedToken) => {
    if (token.type === 'list_item') {
      const raw = token.raw.trim();
      // Check for task marker manually since marked only supports [ ] and [x]
      // Support [ ], [x], [/], [>], [-] with optional spaces
      const taskMarkerMatch = raw.match(
        /^[-*+]\s+\[\s*([xX/\\>-]?)\s*\]\s+(.*)/s,
      );

      if (taskMarkerMatch) {
        const marker = taskMarkerMatch[1];
        const description = taskMarkerMatch[2].split('\n')[0].trim(); // Take only the first line as description

        let status: TodoStatus = 'pending';
        if (marker === 'x') {
          status = 'completed';
        } else if (marker === '/' || marker === '>') {
          status = 'in_progress';
        } else if (marker === '-') {
          status = 'cancelled';
        } else if (marker === '' || marker === ' ') {
          status = 'pending';
        }

        todos.push({
          description,
          status,
        });
      }
    }

    if (token.tokens) {
      token.tokens.forEach(walk);
    }
    if (token.items) {
      token.items.forEach(walk);
    }
  };

  tokens.forEach(walk);
  return todos;
}
