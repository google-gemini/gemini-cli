/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ConsecaSafetyChecker } from './conseca.js';
import { InProcessCheckerType } from '../../policy/types.js';
import { CheckerRegistry } from '../registry.js';

describe('Conseca Integration', () => {
  it('should be registered and resolvable via CheckerRegistry', () => {
    const registry = new CheckerRegistry('.');
    const checker = registry.resolveInProcess(InProcessCheckerType.CONSECA);

    expect(checker).toBeDefined();
    expect(checker).toBeInstanceOf(ConsecaSafetyChecker);
    expect(checker).toBe(ConsecaSafetyChecker.getInstance());
  });
});
