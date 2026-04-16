/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import * as fs from 'node:fs';
import os from 'node:os';
import {
  validatePlanPath,
  validatePlanContent,
  resolveAndValidatePlanPath,
} from './planUtils.js';

describe('planUtils', () => {
  let tempRootDir: string;
  let plansDir: string;

  beforeEach(() => {
    tempRootDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'planUtils-test-')),
    );
    const plansDirRaw = path.join(tempRootDir, 'plans');
    fs.mkdirSync(plansDirRaw, { recursive: true });
    plansDir = fs.realpathSync(plansDirRaw);
  });

  afterEach(() => {
    if (fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
  });

  describe('resolveAndValidatePlanPath', () => {
    it('should strip redundant prefix matching plansDir basename', () => {
      const result = resolveAndValidatePlanPath('plans/test.md', plansDir);
      expect(result).toBe(path.join(plansDir, 'test.md'));
    });

    it('should strip redundant prefix when path starts with ./', () => {
      const result = resolveAndValidatePlanPath('./plans/test.md', plansDir);
      expect(result).toBe(path.join(plansDir, 'test.md'));
    });

    it('should strip redundant prefix matching plansDir basename (with nested path)', () => {
      const result = resolveAndValidatePlanPath(
        'plans/nested/test.md',
        plansDir,
      );
      expect(result).toBe(path.join(plansDir, 'nested/test.md'));
    });

    it('should handle standard paths without the prefix', () => {
      const result = resolveAndValidatePlanPath('test.md', plansDir);
      expect(result).toBe(path.join(plansDir, 'test.md'));
    });

    it('should handle standard paths with ./ prefix', () => {
      const result = resolveAndValidatePlanPath('./test.md', plansDir);
      expect(result).toBe(path.join(plansDir, 'test.md'));
    });

    it('should throw if path is empty after stripping prefix', () => {
      expect(() => resolveAndValidatePlanPath('plans', plansDir)).toThrowError(
        /must include a filename/,
      );
      expect(() => resolveAndValidatePlanPath('plans/', plansDir)).toThrowError(
        /must include a filename/,
      );
      expect(() =>
        resolveAndValidatePlanPath('./plans', plansDir),
      ).toThrowError(/must include a filename/);
    });

    it('should handle mixed separators', () => {
      const result = resolveAndValidatePlanPath(
        'plans\\windows-style.md',
        plansDir,
      );
      expect(result).toBe(path.join(plansDir, 'windows-style.md'));
    });
  });

  describe('validatePlanPath', () => {
    it('should return null for a valid path within plans directory', async () => {
      const planPath = 'test.md';
      const fullPath = path.join(plansDir, planPath);
      fs.writeFileSync(fullPath, '# My Plan');

      const result = await validatePlanPath(planPath, plansDir);
      expect(result).toBeNull();
    });

    it('should return error for non-existent file', async () => {
      const planPath = 'ghost.md';
      const result = await validatePlanPath(planPath, plansDir);
      expect(result).toContain('Plan file does not exist');
    });

    it('should detect path traversal via symbolic links', async () => {
      const maliciousPath = 'malicious.md';
      const fullMaliciousPath = path.join(plansDir, maliciousPath);
      const outsideFile = path.join(tempRootDir, 'outside.txt');
      fs.writeFileSync(outsideFile, 'secret content');

      // Create a symbolic link pointing outside the plans directory
      fs.symlinkSync(outsideFile, fullMaliciousPath);

      const result = await validatePlanPath(maliciousPath, plansDir);
      expect(result).toContain('Access denied');
    });
  });

  describe('validatePlanContent', () => {
    it('should return null for non-empty content', async () => {
      const planPath = path.join(plansDir, 'full.md');
      fs.writeFileSync(planPath, 'some content');
      const result = await validatePlanContent(planPath);
      expect(result).toBeNull();
    });

    it('should return error for empty content', async () => {
      const planPath = path.join(plansDir, 'empty.md');
      fs.writeFileSync(planPath, '   ');
      const result = await validatePlanContent(planPath);
      expect(result).toContain('Plan file is empty');
    });

    it('should return error for unreadable file', async () => {
      const planPath = path.join(plansDir, 'ghost.md');
      const result = await validatePlanContent(planPath);
      // Since isEmpty treats unreadable files as empty (defensive),
      // we expect the "Plan file is empty" message.
      expect(result).toContain('Plan file is empty');
    });
  });
});
