/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PolicyEngine } from '../policy/policy-engine.js';
import { PolicyDecision } from '../policy/types.js';
import {
  WRITE_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
  SHELL_TOOL_NAME,
  WRITE_TODOS_TOOL_NAME,
  MEMORY_TOOL_NAME,
} from '../tools/tool-names.js';

/**
 * Built-in tools that perform write/mutating file-system operations.
 * These are blocked when the prompt specifies a read-only constraint.
 */
export const READ_ONLY_BLOCKED_TOOLS: readonly string[] = [
  WRITE_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
  SHELL_TOOL_NAME,
  WRITE_TODOS_TOOL_NAME,
  MEMORY_TOOL_NAME,
] as const;

/** Source tag on injected deny rules, for auditability. */
export const READ_ONLY_GUARD_SOURCE = 'read-only-guard';

/**
 * High priority ensures these rules win over any user ALLOW/ASK_USER rules.
 */
export const READ_ONLY_RULE_PRIORITY = 999;

/**
 * Regex patterns that signal an explicit read-only execution constraint.
 *
 * Conservative by design — only matches phrases that unambiguously mean
 * "no file writes allowed". Ambiguous uses (e.g. "read only the first line")
 * are intentionally not matched.
 */
const READ_ONLY_PATTERNS: RegExp[] = [
  /\bno\s+file\s+modifications?\b/i,
  /\bread[\s-]only\s+(?:consulting|engagement|mode|analysis)\b/i,
  /\bdo\s+not\s+(?:write|create|edit|delete|modify)\s+(?:any\s+)?files?\b/i,
  /\bdo\s+not\s+write\b/i,
  /\bno\s+writes?\b/i,
  /\bthis\s+is\s+a\s+read[\s-]only\b/i,
];

/**
 * Returns `true` when the prompt text contains an explicit read-only
 * constraint, indicating that file-write tools should be blocked.
 */
export function isReadOnlyTask(text: string): boolean {
  if (!text) return false;
  return READ_ONLY_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Injects high-priority `PolicyDecision.DENY` rules into `engine` for every
 * write-capable built-in tool. Read-only tools (glob, grep, ls, read_file,
 * etc.) are not affected.
 */
export function injectReadOnlyDenyRules(engine: PolicyEngine): void {
  for (const toolName of READ_ONLY_BLOCKED_TOOLS) {
    engine.addRule({
      name: `read-only-guard:${toolName}`,
      toolName,
      decision: PolicyDecision.DENY,
      priority: READ_ONLY_RULE_PRIORITY,
      source: READ_ONLY_GUARD_SOURCE,
      denyMessage:
        'This operation is blocked because the task brief specifies a READ-ONLY ' +
        'constraint (e.g. "NO file modifications"). Analysis is being performed ' +
        'in-chat without writing any files.',
    });
  }
}
