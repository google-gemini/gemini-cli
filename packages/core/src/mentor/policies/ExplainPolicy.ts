/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MentorPolicy } from '../MentorPolicy.js';

export class ExplainPolicy implements MentorPolicy {
  public readonly intent = 'explain';
  public readonly name = 'Deep Code Comprehension';
  public readonly description = 'Explains codebase architecture, components, and data flow.';

  public getDirectives(): string {
    return `### ACTIVE POLICY: DEEP EXPLANATION (/explain)
- Inspect the relevant files directly before explaining.
- Explain:
  1. What responsibility this component or file holds.
  2. The end-to-end data flow and lifecycle of requests/events.
  3. Key design decisions and architectural trade-offs made in the code.
- Connect concepts to the wider system rather than summarizing code line-by-line.`;
  }
}
