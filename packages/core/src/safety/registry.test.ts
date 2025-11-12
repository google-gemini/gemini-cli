/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CheckerRegistry } from './registry.js';
import { InProcessCheckerType } from '../policy/types.js';
import { AllowedPathChecker } from './built-in.js';

describe('CheckerRegistry', () => {
  let registry: CheckerRegistry;
  const mockCheckersPath = '/mock/checkers/path';

  beforeEach(() => {
    registry = new CheckerRegistry(mockCheckersPath);
  });

  it('should resolve built-in in-process checkers', () => {
    const checker = registry.resolveInProcess(
      InProcessCheckerType.ALLOWED_PATH,
    );
    expect(checker).toBeInstanceOf(AllowedPathChecker);
  });

  it('should throw for unknown in-process checkers', () => {
    expect(() => registry.resolveInProcess('unknown-checker')).toThrow(
      'Unknown in-process checker "unknown-checker"',
    );
  });

  it('should validate checker names', () => {
    expect(() => registry.resolveInProcess('invalid name!')).toThrow(
      'Invalid checker name',
    );
    expect(() => registry.resolveInProcess('../escape')).toThrow(
      'Invalid checker name',
    );
  });

  it('should throw for unknown external checkers (for now)', () => {
    expect(() => registry.resolveExternal('some-external')).toThrow(
      'Unknown external checker "some-external"',
    );
  });
});
