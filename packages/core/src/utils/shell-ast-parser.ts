/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import parse from 'bash-parser';

interface BashNode {
  type?: string;
  name?: { text?: string };
  suffix?: Array<{ text?: string }>;
}

/**
 * Parses a raw shell string and extracts all individual executable commands.
 * Handles simple commands, pipelines, lists, and subshells.
 *
 * @param shellString The raw shell command string
 * @returns An array of string representing the commands
 */
export function extractCommandsFromAst(shellString: string): string[] {
  if (!shellString || !shellString.trim()) {
    return [];
  }

  const commands: string[] = [];

  try {
    // We use bash-parser to construct an AST synchronously.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const ast = parse(shellString, { insertResolutionScope: true });

    // A simple recursive traversal to find all 'Command' nodes
    const traverse = (node: unknown) => {
      if (!node || typeof node !== 'object') return;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const bashNode = node as BashNode;

      if (bashNode.type === 'Command') {
        const parts: string[] = [];
        if (bashNode.name && bashNode.name.text) {
          parts.push(bashNode.name.text);
        }
        
        if (Array.isArray(bashNode.suffix)) {
          bashNode.suffix.forEach((s: unknown) => {
            if (s && typeof s === 'object' && 'text' in s && typeof (s as Record<string, unknown>)['text'] === 'string') {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              parts.push((s as {text: string}).text);
            }
          });
        }
        
        if (parts.length > 0) {
          commands.push(parts.join(' '));
        }
      }

      // Recursively traverse all object properties to find nested commands
      // (like those in pipelines, lists, or subshells)
      for (const key of Object.keys(node)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const child = (node as Record<string, unknown>)[key];
        if (typeof child === 'object' && child !== null) {
          if (Array.isArray(child)) {
            child.forEach(traverse);
          } else {
            traverse(child);
          }
        }
      }
    };

    traverse(ast);
  } catch (_error) {
    // Graceful failure on syntax errors; return whatever we successfully parsed so far, or empty.
  }

  return commands;
}
