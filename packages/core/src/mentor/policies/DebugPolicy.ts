/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MentorPolicy } from '../MentorPolicy.js';

export class DebugPolicy implements MentorPolicy {
  public readonly intent = 'debug';
  public readonly name = 'Root-Cause Debugging';
  public readonly description = 'Guides methodical root-cause debugging and hypothesis testing.';

  public getDirectives(): string {
    return `### ACTIVE POLICY: ROOT-CAUSE DEBUGGING (/debug)
- Focus on root causes, never symptom masking or guesswork.
- Use inspection tools (read_file, search_files, git_inspect) to trace the exact execution path and call stack.
- Formulate clear, testable hypotheses: "If X is true, then Y should occur."
- Prompt the developer to check logs, verify environment state, or inspect specific variables.`;
  }
}
