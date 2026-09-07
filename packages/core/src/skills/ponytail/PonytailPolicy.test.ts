/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { PonytailPolicy } from './PonytailPolicy.js';

describe('PonytailPolicy', () => {
  it('has correct intent, name, and minimalist directives', () => {
    const policy = new PonytailPolicy();
    expect(policy.intent).toBe('ponytail');
    expect(policy.name).toBe('Ponytail Minimalist Philosopher');
    expect(policy.description).toContain('Radical simplicity');

    const directives = policy.getDirectives();
    expect(directives).toContain('CODE DELETION OVER ADDITION');
    expect(directives).toContain('STANDARD LIBRARY OVER EXTERNAL CRUTCHES');
    expect(directives).toContain('FIGHT PREMATURE ABSTRACTION');
  });
});
