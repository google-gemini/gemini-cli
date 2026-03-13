/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  HookType,
  HookEventName,
  type RuntimeHookConfig,
  type AfterToolInput,
  type HookInput,
  type HookOutput,
  type HookAction,
} from './types.js';
import type { LspService } from '../services/lspService.js';

/**
 * Hook that triggers LSP diagnostics after a file is modified by a tool.
 */
export function createLspDiagnosticsHook(
  lspService: LspService,
): RuntimeHookConfig {
  const action: HookAction = async (
    input: HookInput,
  ): Promise<HookOutput | void | null> => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const afterToolInput = input as AfterToolInput;
    // Only trigger for file modification tools
    const toolName = afterToolInput.tool_name;
    if (
      toolName !== 'edit' &&
      toolName !== 'write_file' &&
      toolName !== 'replace'
    ) {
      return;
    }

    // Skip if the tool failed
    if (afterToolInput.tool_response['error']) {
      return;
    }

    // Extract file path from tool input
    const filePath = afterToolInput.tool_input['file_path'];
    if (typeof filePath !== 'string') {
      return;
    }

    // Trigger LSP diagnostics
    const diagnostics = await lspService.getDiagnostics(filePath);

    if (diagnostics.length > 0) {
      const formattedDiagnostics = diagnostics
        .map((d) => {
          // Improve readability of common linter regexes (e.g. /^_/u -> ^_)
          const readableMessage = d.message.replace(/\/([^/]+)\/u/g, '$1');
          return `- [${d.severity.toUpperCase()}] Line ${d.line}, Col ${d.column}: ${readableMessage}`;
        })
        .join('\n');

      return {
        hookSpecificOutput: {
          hookEventName: HookEventName.AfterTool,
          additionalContext: `LSP Diagnostics for ${filePath}:\n${formattedDiagnostics}\n\nPlease address these issues if they are relevant to your task.`,
          diagnostics: formattedDiagnostics,
        },
      };
    }
  };

  return {
    type: HookType.Runtime,
    name: 'lsp-diagnostics',
    action,
  };
}
