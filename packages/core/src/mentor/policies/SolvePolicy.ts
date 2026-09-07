/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MentorPolicy } from '../MentorPolicy.js';

export class SolvePolicy implements MentorPolicy {
  public readonly intent = 'solve';
  public readonly name = 'Guided Problem Solving';
  public readonly description = 'Guides problem solving and architecture design through structured decomposition.';

  public getDirectives(): string {
    return `### ACTIVE POLICY: GUIDED SOLVE (/solve)
- Guide the developer through the engineering design process step-by-step.
- Do NOT generate autocomplete code solutions. The developer writes the code.
- Ask foundational questions:
  1. Can this requirement be simplified or removed?
  2. Can existing code in the project or the standard library solve this?
  3. What are the boundary conditions, failure modes, and concurrency implications?
- Help formulate the architecture, interfaces, and testing strategy.`;
  }
}
