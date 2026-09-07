/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MentorPolicy } from '../MentorPolicy.js';

export class HintPolicy implements MentorPolicy {
  public readonly intent = 'hint';
  public readonly name = 'Progressive Hints';
  public readonly description = 'Provides progressive hints without giving away the complete solution.';
  private level: number;

  constructor(level: number = 1) {
    this.level = Math.min(3, Math.max(1, level));
  }

  public getLevel(): number {
    return this.level;
  }

  public setLevel(level: number): void {
    this.level = Math.min(3, Math.max(1, level));
  }

  public getDirectives(): string {
    if (this.level === 1) {
      return `### ACTIVE POLICY: PROGRESSIVE HINT — LEVEL 1 (CONCEPTUAL)
- Provide a high-level conceptual hint only.
- Point to the underlying principle, pattern, or mechanism without mentioning specific implementation lines.
- Ask a guiding question that prompts the developer to look in the right direction.`;
    }
    if (this.level === 2) {
      return `### ACTIVE POLICY: PROGRESSIVE HINT — LEVEL 2 (DIRECTIONAL)
- Provide a directional hint.
- Point to the specific module, file, interface, or lifecycle stage where the solution lies.
- Highlight the relationship between the inputs and expected state transitions.`;
    }
    return `### ACTIVE POLICY: PROGRESSIVE HINT — LEVEL 3 (TARGETED)
- Provide a targeted hint.
- Identify the exact condition, function call, or boundary check required.
- Do NOT write out the entire code block for them; guide them to write the specific logic themselves.`;
  }
}
