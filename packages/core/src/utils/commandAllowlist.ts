/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCommandRoots, hasRedirection } from './shell-utils.js';
import { ApprovalMode } from '../policy/types.js';

/**
 * Strictly read-only commands that are safe for permanent auto-approval
 * in any mode. Every command here must be unable to modify files, execute
 * other programs, or cause side effects regardless of flags/arguments.
 *
 * SECURITY: Do NOT add commands that can:
 * - Execute arbitrary subcommands (find -exec, awk system(), xargs)
 * - Modify files with flags (sed -i, sort -o)
 * - Make network changes (curl, wget)
 * - Change permissions/ownership (chmod, chown)
 */
export const safeCommandAllowlist = new Set([
  'ls',
  'cat',
  'grep',
  'pwd',
  'head',
  'tail',
  'less',
  'more',
  'whoami',
  'date',
  'clear',
  'history',
  'man',
  'sort',
  'uniq',
  'wc',
  'diff',
  'which',
  'type',
  'file',
  'basename',
  'dirname',
  'realpath',
]);

/**
 * Commands that mutate files but are reasonable to auto-approve when the
 * user has already opted into auto-edit mode.
 */
export const editCommandAllowlist = new Set(['cp', 'mv', 'mkdir', 'touch']);

export function canShowAutoApproveCheckbox(
  command: string,
  approvalMode: ApprovalMode,
): boolean {
  // Fail closed on empty/whitespace input
  if (!command || !command.trim()) return false;

  // Fail closed on ANY redirection. Redirections inherently write/read files
  // and we cannot safely audit the source/dest in a general way.
  if (hasRedirection(command)) return false;

  let roots: string[];
  try {
    roots = getCommandRoots(command);
  } catch {
    // Parser failed — fail closed
    return false;
  }

  // No roots extracted — fail closed
  if (!roots || roots.length === 0) return false;

  const isAutoEdit = approvalMode === ApprovalMode.AUTO_EDIT;

  // EVERY root must be on an allowlist
  return roots.every((root) => {
    // Strip path prefixes (e.g., /usr/bin/ls → ls)
    const base = root.split('/').pop() ?? root;

    if (safeCommandAllowlist.has(base)) return true;
    if (isAutoEdit && editCommandAllowlist.has(base)) return true;
    return false;
  });
}
