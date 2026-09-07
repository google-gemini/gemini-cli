/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MentorPolicy } from '../MentorPolicy.js';

export class LearnPolicy implements MentorPolicy {
  public readonly intent = 'learn';
  public readonly name = 'Socratic Learning';
  public readonly description = 'Guides conceptual mastery through Socratic dialogue and active recall.';

  public getDirectives(): string {
    return `### ACTIVE POLICY: SOCRATIC LEARNING (/learn)
- Do not lecture with massive walls of text.
- Break down complex software concepts into intuitive first principles.
- Use analogy, ask thought-provoking questions, and verify the developer's understanding before advancing.
- Emphasize "why" a pattern exists, what trade-offs it brings, and when NOT to use it.`;
  }
}
