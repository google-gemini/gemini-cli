/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConcreteNode } from '../graph/types.js';

export interface FormatNodesOptions {
  /**
   * The maximum number of characters to retain from a tool response.
   * Tool responses larger than this will be truncated to preserve LLM attention span
   * and avoid context limits during summarization operations.
   * Defaults to 2000.
   */
  maxToolResponseChars?: number;
}

/**
 * Maps common tool names to semantic wrappers that improve LLM reading comprehension.
 */
function getSemanticToolWrapper(toolName: string): string {
  if (toolName.includes('search') || toolName.includes('grep'))
    return `SEARCH RESULTS`;
  if (toolName.includes('list') || toolName.includes('dir'))
    return `WORKSPACE STRUCTURE`;
  if (toolName.includes('shell') || toolName.includes('cmd'))
    return `SHELL EXECUTION`;
  if (toolName.includes('read') || toolName.includes('fetch'))
    return `FILE/WEB CONTENT`;
  return `TOOL RESPONSE`;
}

/**
 * Formats a sequence of Context Graph nodes into a dense, human/LLM-readable text transcript.
 * This is used by summarization processors (like SnapshotGenerator and RollingSummaryProcessor)
 * to serialize the graph before passing it to an LLM.
 */
export function formatNodesForLlm(
  nodes: readonly ConcreteNode[],
  options: FormatNodesOptions = {},
): string {
  const maxToolChars = options.maxToolResponseChars ?? 2000;
  let transcript = '';

  // Extract unique chronological turn IDs
  const uniqueTurns = Array.from(
    new Set(nodes.map((n) => n.turnId).filter(Boolean)),
  );

  for (const node of nodes) {
    const payload = node.payload;
    let nodeContent = '';

    if (payload.text) {
      nodeContent = payload.text;
    } else if (payload.functionCall) {
      nodeContent = `CALL: ${payload.functionCall.name}(${JSON.stringify(payload.functionCall.args)})`;
    } else if (payload.functionResponse) {
      const toolName = payload.functionResponse.name || 'unknown_tool';
      const rawResponse = JSON.stringify(payload.functionResponse.response);
      const semanticWrapper = getSemanticToolWrapper(toolName);

      let formattedResponse = rawResponse;
      if (rawResponse.length > maxToolChars) {
        const half = Math.floor(maxToolChars / 2);
        const truncatedCount = rawResponse.length - maxToolChars;
        formattedResponse = `${rawResponse.substring(0, half)}... [TRUNCATED ${truncatedCount} chars] ...${rawResponse.substring(rawResponse.length - half)}`;
      }
      nodeContent = `[${semanticWrapper} (${toolName})]: ${formattedResponse}`;
    } else {
      // Fallback for unexpected node shapes
      nodeContent = JSON.stringify(payload);
    }

    const role = (node.role || 'system').toUpperCase();

    // Calculate relative turn index (e.g., -2, -1, 0)
    let turnMarker = '';
    if (node.turnId) {
      const idx = uniqueTurns.indexOf(node.turnId);
      if (idx !== -1) {
        const relativeIdx = idx - (uniqueTurns.length - 1);
        turnMarker = `[Turn ${relativeIdx}] `;
      }
    }

    transcript += `${turnMarker}[${role}] [${node.type}]: ${nodeContent}\n`;
  }

  return transcript;
}
