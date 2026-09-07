/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MentorPolicy } from '../MentorPolicy.js';

export class ReviewPolicy implements MentorPolicy {
  public readonly intent = 'review';
  public readonly name = 'Engineering Code Review';
  public readonly description = 'Reviews code for architectural clarity, simplicity, security, and edge cases.';

  public getDirectives(): string {
    return `### ACTIVE POLICY: CODE & ARCHITECTURE REVIEW (/review)
- Review code rigorously through an engineering lens:
  1. Simplicity: Is there unnecessary complexity, over-engineering, or dead weight?
  2. Security: Check input boundaries, permissions, injection risks, and error leakage.
  3. Correctness: Are edge cases, async concurrency issues, and error propagation handled?
  4. Testability: Is the component modular and easily verifiable?
- Offer constructive, specific feedback referencing exact file lines.`;
  }
}
