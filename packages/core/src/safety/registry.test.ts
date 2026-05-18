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
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'realpathSync').mockImplementation((p) => p as string);

      const customCheckers = new Map([
        ['my-custom-checker', '/usr/local/bin/my-checker'],
      ]);
      const customRegistry = new CheckerRegistry(
        mockCheckersPath,
        customCheckers,
      );

      const resolvedPath = customRegistry.resolveExternal('my-custom-checker');
      expect(resolvedPath).toBe('/usr/local/bin/my-checker');
    });

    it('should throw when custom checker executable does not exist', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const customCheckers = new Map([
        ['missing-checker', '/usr/local/bin/missing-checker'],
      ]);

      expect(
        () => new CheckerRegistry(mockCheckersPath, customCheckers),
      ).toThrow(
        'Custom checker "missing-checker" not found at /usr/local/bin/missing-checker',
      );
    });

    it('should include custom checkers in getAllExternalCheckerNames', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const customCheckers = new Map([
        ['custom-one', '/usr/local/bin/custom-one'],
        ['custom-two', '/usr/local/bin/custom-two'],
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
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const customCheckers = new Map([
        ['custom-checker', '/usr/local/bin/custom-checker'],
      ]);
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
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const customCheckers = new Map([
        ['valid-name', '/usr/local/bin/valid-name'],
      ]);
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

    it('should reject paths with traversal sequences', () => {
      const customCheckers = new Map([
        ['traversal-checker', '/usr/local/bin/../../../etc/malicious'],
      ]);

      expect(
        () => new CheckerRegistry(mockCheckersPath, customCheckers),
      ).toThrow(
        'Custom checker "traversal-checker" path must not contain \'..\'',
      );
    });

    it('should reject checkers outside trusted directories', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const customCheckers = new Map([
        ['untrusted-checker', '/tmp/malicious-checker'],
      ]);

      expect(
        () => new CheckerRegistry(mockCheckersPath, customCheckers),
      ).toThrow(
        'Custom checker "untrusted-checker" at /tmp/malicious-checker is outside trusted directories',
      );
    });

    it('should allow checkers outside trusted directories if explicitly approved', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'realpathSync').mockImplementation((p) => p as string);

      const customCheckers = new Map([
        ['approved-checker', '/tmp/approved-checker'],
      ]);
      const approvedCheckers = new Set(['approved-checker']);
      const customRegistry = new CheckerRegistry(
        mockCheckersPath,
        customCheckers,
        ['/usr/local/bin'],
        approvedCheckers,
      );

      const resolvedPath = customRegistry.resolveExternal('approved-checker');
      expect(resolvedPath).toBe('/tmp/approved-checker');
    });

    it('should allow custom trusted directories', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'realpathSync').mockImplementation((p) => p as string);

      const customCheckers = new Map([
        ['custom-dir-checker', '/opt/my-company/checkers/my-checker'],
      ]);
      const customRegistry = new CheckerRegistry(
        mockCheckersPath,
        customCheckers,
        ['/opt/my-company/checkers'],
      );

      const resolvedPath = customRegistry.resolveExternal('custom-dir-checker');
      expect(resolvedPath).toBe('/opt/my-company/checkers/my-checker');
    });
  });
});
