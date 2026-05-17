/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { CheckerRegistry } from './registry.js';
import { InProcessCheckerType } from '../policy/types.js';
import { AllowedPathChecker } from './built-in.js';
import { ConsecaSafetyChecker } from './conseca/conseca.js';

vi.mock('node:fs');

describe('CheckerRegistry', () => {
  let registry: CheckerRegistry;
  const mockCheckersPath = '/mock/checkers/path';

  beforeEach(() => {
    vi.resetAllMocks();
    registry = new CheckerRegistry(mockCheckersPath);
  });

  it('should resolve built-in in-process checkers', () => {
    const allowedPathChecker = registry.resolveInProcess(
      InProcessCheckerType.ALLOWED_PATH,
    );
    expect(allowedPathChecker).toBeInstanceOf(AllowedPathChecker);

    const consecaChecker = registry.resolveInProcess(
      InProcessCheckerType.CONSECA,
    );
    expect(consecaChecker).toBeInstanceOf(ConsecaSafetyChecker);
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

  it('should throw for unknown external checkers with available list', () => {
    expect(() => registry.resolveExternal('some-external')).toThrow(
      'Unknown external checker "some-external". Available: ',
    );
  });

  describe('custom external checkers', () => {
    it('should resolve custom external checkers when provided', () => {
      const customCheckers = new Map([
        ['my-custom-checker', '/path/to/my-checker'],
      ]);
      const customRegistry = new CheckerRegistry(
        mockCheckersPath,
        customCheckers,
      );

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const resolvedPath = customRegistry.resolveExternal('my-custom-checker');
      expect(resolvedPath).toBe('/path/to/my-checker');
    });

    it('should throw when custom checker executable does not exist', () => {
      const customCheckers = new Map([
        ['missing-checker', '/path/to/missing-checker'],
      ]);
      const customRegistry = new CheckerRegistry(
        mockCheckersPath,
        customCheckers,
      );

      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(() => customRegistry.resolveExternal('missing-checker')).toThrow(
        'Custom checker "missing-checker" not found at /path/to/missing-checker',
      );
    });

    it('should include custom checkers in getAllExternalCheckerNames', () => {
      const customCheckers = new Map([
        ['custom-one', '/path/to/one'],
        ['custom-two', '/path/to/two'],
      ]);
      const customRegistry = new CheckerRegistry(
        mockCheckersPath,
        customCheckers,
      );

      const names = customRegistry.getAllExternalCheckerNames();
      expect(names).toContain('custom-one');
      expect(names).toContain('custom-two');
    });

    it('should include custom checkers in getAllCheckers', () => {
      const customCheckers = new Map([['custom-checker', '/path/to/checker']]);
      const customRegistry = new CheckerRegistry(
        mockCheckersPath,
        customCheckers,
      );

      const allCheckers = customRegistry.getAllCheckers();
      expect(allCheckers).toContain('custom-checker');
      expect(allCheckers).toContain(InProcessCheckerType.ALLOWED_PATH);
      expect(allCheckers).toContain(InProcessCheckerType.CONSECA);
    });

    it('should work without custom checkers (empty map)', () => {
      const emptyRegistry = new CheckerRegistry(mockCheckersPath, new Map());

      expect(emptyRegistry.getAllExternalCheckerNames()).toEqual([]);
      expect(() => emptyRegistry.resolveExternal('any-checker')).toThrow(
        'Unknown external checker',
      );
    });

    it('should validate checker names for custom checkers', () => {
      const customCheckers = new Map([['valid-name', '/path/to/checker']]);
      const customRegistry = new CheckerRegistry(
        mockCheckersPath,
        customCheckers,
      );

      expect(() => customRegistry.resolveExternal('invalid name!')).toThrow(
        'Invalid checker name',
      );
    });

    it('should reject relative paths for custom checkers', () => {
      const customCheckers = new Map([
        ['relative-checker', './relative/path/to/checker'],
      ]);

      expect(
        () => new CheckerRegistry(mockCheckersPath, customCheckers),
      ).toThrow(
        'Custom checker "relative-checker" path must be absolute: ./relative/path/to/checker',
      );
    });
  });
});
