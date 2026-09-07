/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ChallengePolicy } from './ChallengePolicy.js';

describe('ChallengePolicy', () => {
  it('has correct intent, name, and Socratic evaluation directives', () => {
    const policy = new ChallengePolicy();
    expect(policy.intent).toBe('challenge');
    expect(policy.name).toBe('Socratic Challenge Evaluator');
    expect(policy.description).toContain('Active engineering practice');

    const directives = policy.getDirectives();
    expect(directives).toContain('RIGOROUS FIRST-PRINCIPLES SCRUTINY');
    expect(directives).toContain('DEFEND ARCHITECTURAL TRADE-OFFS');
    expect(directives).toContain('MASTERY RECOGNITION');
  });
});
