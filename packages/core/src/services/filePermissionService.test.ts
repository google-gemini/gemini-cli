/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { mock, MockProxy } from 'vitest-mock-extended';
import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import { FilePermissionService, FilePermissionRule, FileOperation } from './filePermissionService.js';
import { Config } from '../config/config.js';

describe('FilePermissionService', () => {
  let mockConfig: MockProxy<Config>;
  let service: FilePermissionService;
  const targetDir = '/test/project';

  beforeEach(() => {
    mockConfig = mock<Config>();
    mockConfig.getTargetDir.mockReturnValue(targetDir);
  });

  const setupServiceWithRules = (rules: FilePermissionRule[]) => {
    mockConfig.getFilePermissionRules.mockReturnValue(rules);
    service = new FilePermissionService(mockConfig);
  };

  describe('Basic Allow/Deny', () => {
    it('should deny by default if no rules match', () => {
      setupServiceWithRules([]);
      expect(service.canPerformOperation(path.join(targetDir, 'file.txt'), 'read')).toBe(false);
    });

    it('should allow if an allow rule matches', () => {
      setupServiceWithRules([
        { patterns: ['file.txt'], operations: ['read'], effect: 'allow' },
      ]);
      expect(service.canPerformOperation(path.join(targetDir, 'file.txt'), 'read')).toBe(true);
    });

    it('should deny if a deny rule matches', () => {
      setupServiceWithRules([
        { patterns: ['file.txt'], operations: ['read'], effect: 'deny' },
      ]);
      expect(service.canPerformOperation(path.join(targetDir, 'file.txt'), 'read')).toBe(false);
    });

    it('should respect rule order: first matching rule wins (deny first)', () => {
      setupServiceWithRules([
        { patterns: ['file.txt'], operations: ['read'], effect: 'deny' },
        { patterns: ['file.txt'], operations: ['read'], effect: 'allow' },
      ]);
      expect(service.canPerformOperation(path.join(targetDir, 'file.txt'), 'read')).toBe(false);
    });

    it('should respect rule order: first matching rule wins (allow first)', () => {
      setupServiceWithRules([
        { patterns: ['file.txt'], operations: ['read'], effect: 'allow' },
        { patterns: ['file.txt'], operations: ['read'], effect: 'deny' },
      ]);
      expect(service.canPerformOperation(path.join(targetDir, 'file.txt'), 'read')).toBe(true);
    });
  });

  describe('Pattern Matching', () => {
    it('should allow with wildcard pattern', () => {
      setupServiceWithRules([
        { patterns: ['*.txt'], operations: ['read'], effect: 'allow' },
      ]);
      expect(service.canPerformOperation(path.join(targetDir, 'another.txt'), 'read')).toBe(true);
      expect(service.canPerformOperation(path.join(targetDir, 'file.md'), 'read')).toBe(false);
    });

    it('should allow with directory wildcard pattern', () => {
      setupServiceWithRules([
        { patterns: ['src/**/*.ts'], operations: ['write'], effect: 'allow' },
      ]);
      expect(service.canPerformOperation(path.join(targetDir, 'src/app/component.ts'), 'write')).toBe(true);
      expect(service.canPerformOperation(path.join(targetDir, 'src/legacy/main.js'), 'write')).toBe(false);
      expect(service.canPerformOperation(path.join(targetDir, 'test/app/component.test.ts'), 'write')).toBe(false);
    });

    it('should handle multiple patterns in a single rule', () => {
      setupServiceWithRules([
        { patterns: ['*.md', 'docs/*.txt'], operations: ['read'], effect: 'allow' },
      ]);
      expect(service.canPerformOperation(path.join(targetDir, 'README.md'), 'read')).toBe(true);
      expect(service.canPerformOperation(path.join(targetDir, 'docs/guide.txt'), 'read')).toBe(true);
      expect(service.canPerformOperation(path.join(targetDir, 'src/code.ts'), 'read')).toBe(false);
    });
  });

  describe('Operation Matching', () => {
    it('should only allow specified operations', () => {
      setupServiceWithRules([
        { patterns: ['config.json'], operations: ['read'], effect: 'allow' },
      ]);
      expect(service.canPerformOperation(path.join(targetDir, 'config.json'), 'read')).toBe(true);
      expect(service.canPerformOperation(path.join(targetDir, 'config.json'), 'write')).toBe(false);
    });

    it('should allow if rule includes multiple operations', () => {
      setupServiceWithRules([
        { patterns: ['user.data'], operations: ['read', 'write'], effect: 'allow' },
      ]);
      expect(service.canPerformOperation(path.join(targetDir, 'user.data'), 'read')).toBe(true);
      expect(service.canPerformOperation(path.join(targetDir, 'user.data'), 'write')).toBe(true);
    });
  });

  describe('Path Normalization and Security', () => {
    it('should deny paths outside targetDir', () => {
      setupServiceWithRules([ // Allow all reads within targetDir for this test
        { patterns: ['**/*'], operations: ['read'], effect: 'allow' },
      ]);
      // This path, when resolved, would be outside /test/project
      const outsidePath = path.resolve(targetDir, '../outside.txt');
      expect(service.canPerformOperation(outsidePath, 'read')).toBe(false);
    });

    it('should correctly handle relative paths for patterns (relative to targetDir)', () => {
      setupServiceWithRules([
        { patterns: ['src/file.ts'], operations: ['read'], effect: 'allow' },
      ]);
      expect(service.canPerformOperation(path.join(targetDir, 'src/file.ts'), 'read')).toBe(true);
      expect(service.canPerformOperation(path.join(targetDir, 'file.ts'), 'read')).toBe(false);
    });

     it('should match dotfiles with patterns explicitly including them or if dot:true is default', () => {
      setupServiceWithRules([
        { patterns: ['.configrc'], operations: ['read'], effect: 'allow' },
        { patterns: ['src/.env'], operations: ['read'], effect: 'allow' },
      ]);
      expect(service.canPerformOperation(path.join(targetDir, '.configrc'), 'read')).toBe(true);
      expect(service.canPerformOperation(path.join(targetDir, 'src/.env'), 'read')).toBe(true);
      // Assuming minimatch default `dot:true` or if not, this might need adjustment or explicit `{ dot: true }`
      // For minimatch, `dot:true` is often needed for patterns like `*` to match dotfiles.
      // Our current implementation uses `minimatch(relativeFilePath, pattern, { dot: true })`
    });
  });

  describe('Complex Scenarios', () => {
    const rules: FilePermissionRule[] = [
      { description: 'Allow read for all .md files', patterns: ['**/*.md'], operations: ['read'], effect: 'allow' },
      { description: 'Deny write for anything in secure/', patterns: ['secure/**/*'], operations: ['write'], effect: 'deny' },
      { description: 'Allow write for specific secure config', patterns: ['secure/config.json'], operations: ['write'], effect: 'allow' },
      { description: 'Deny read for all .key files', patterns: ['**/*.key'], operations: ['read'], effect: 'deny' },
      { description: 'Allow all operations for temp files', patterns: ['temp/*'], operations: ['read', 'write'], effect: 'allow'},
      { description: 'Deny everything else in temp/critical', patterns: ['temp/critical/**'], operations: ['read', 'write'], effect: 'deny'},

    ];
    beforeEach(() => setupServiceWithRules(rules));

    it('Scenario 1: Read markdown - allowed', () => {
      expect(service.canPerformOperation(path.join(targetDir, 'docs/guide.md'), 'read')).toBe(true);
    });

    it('Scenario 2: Write to secure file - denied', () => {
      expect(service.canPerformOperation(path.join(targetDir, 'secure/data.txt'), 'write')).toBe(false);
    });

    it('Scenario 3: Write to specific secure config - allowed (due to order)', () => {
      // This depends on the 'secure/config.json' allow rule appearing *after* 'secure/**/*' deny, if minimatch processes all rules.
      // However, our service stops at the first match. So, if 'secure/config.json' is more specific and checked first, it would be allowed.
      // Current implementation: first rule in array wins.
      // For this to be allowed, the specific allow must come BEFORE the general deny for the same path prefix.
      // Let's re-order for this test case to be meaningful for "specific allow overrides general deny if ordered correctly"
      const reorderedRules: FilePermissionRule[] = [
        { description: 'Allow write for specific secure config', patterns: ['secure/config.json'], operations: ['write'], effect: 'allow' },
        { description: 'Deny write for anything in secure/', patterns: ['secure/**/*'], operations: ['write'], effect: 'deny' },
        { description: 'Allow read for all .md files', patterns: ['**/*.md'], operations: ['read'], effect: 'allow' },
      ];
      setupServiceWithRules(reorderedRules);
      expect(service.canPerformOperation(path.join(targetDir, 'secure/config.json'), 'write')).toBe(true);
      expect(service.canPerformOperation(path.join(targetDir, 'secure/other.txt'), 'write')).toBe(false); // Still denied by the broader rule
    });

    it('Scenario 4: Read .key file - denied', () => {
      expect(service.canPerformOperation(path.join(targetDir, 'secrets/api.key'), 'read')).toBe(false);
    });

    it('Scenario 5: Write to temp file - allowed', () => {
         setupServiceWithRules(rules); // Reset to original rules
      expect(service.canPerformOperation(path.join(targetDir, 'temp/log.txt'), 'write')).toBe(true);
    });

    it('Scenario 6: Read from temp/critical/file.txt - denied', () => {
        setupServiceWithRules(rules); // Reset to original rules
        expect(service.canPerformOperation(path.join(targetDir, 'temp/critical/important.dat'), 'read')).toBe(false);
    });

    it('Scenario 7: Read from temp/allowed.txt - allowed', () => {
        setupServiceWithRules(rules); // Reset to original rules
        expect(service.canPerformOperation(path.join(targetDir, 'temp/allowed.txt'), 'read')).toBe(true);
    });
  });
});
