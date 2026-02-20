/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sanitizes content from MCP servers to prevent prompt injection.
 * It wraps the content in explicit delimiters to help the model distinguish
 * between tool output and system instructions.
 *
 * @param content The raw content string from an MCP tool or resource.
 * @returns The sanitized content string.
 */
export function sanitizeMcpContent(content: string): string {
  return `--- Start of MCP Tool Response ---\n${content}\n--- End of MCP Tool Response ---`;
}
