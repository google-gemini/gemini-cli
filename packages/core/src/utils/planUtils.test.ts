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

  describe('validatePlanPath', () => {
    it('should return null for a valid path within plans directory', async () => {
      const planPath = 'test.md';
      const fullPath = path.join(plansDir, planPath);
      fs.writeFileSync(fullPath, '# My Plan');

      const result = await validatePlanPath(planPath, plansDir, tempRootDir);
      expect(result).toBeNull();
    });

    it('should return error for non-existent file', async () => {
      const planPath = 'ghost.md';
      const result = await validatePlanPath(planPath, plansDir, tempRootDir);
      expect(result).toContain('Plan file does not exist');
    });

    it('should detect path traversal via symbolic links', async () => {
      const maliciousPath = 'malicious.md';
      const fullMaliciousPath = path.join(plansDir, maliciousPath);

      // Create a file outside the plans directory
      const outsideFile = path.join(tempRootDir, 'outside.md');
      fs.writeFileSync(outsideFile, 'secret content');

      // Create a symbolic link pointing outside the plans directory
      fs.symlinkSync(outsideFile, fullMaliciousPath);

      const result = await validatePlanPath(
        maliciousPath,
        plansDir,
        tempRootDir,
      );
      expect(result).toContain('Access denied');
    });

    it('should validate a nested path within the plans directory', async () => {
      const nestedDir = path.join(plansDir, 'tracks', 'fibsqrt_20260519');
      fs.mkdirSync(nestedDir, { recursive: true });
      const planPath = path.join('tracks', 'fibsqrt_20260519', 'spec.md');
      const fullPath = path.join(plansDir, planPath);
      fs.writeFileSync(fullPath, '# Nested Spec');

      const result = await validatePlanPath(planPath, plansDir, tempRootDir);
      expect(result).toBeNull();
    });
  });

  describe('resolveAndValidatePlanPath', () => {
    it('should resolve simple filenames relative to plansDir', () => {
      const result = resolveAndValidatePlanPath(
        'implementation_plan.md',
        plansDir,
        tempRootDir,
      );
      expect(result).toBe(path.join(plansDir, 'implementation_plan.md'));
    });

    it('should preserve subdirectories if already inside plansDir', () => {
      const planPath = path.join(
        'plans',
        'tracks',
        'fibsqrt_20260519',
        'spec.md',
      );
      const result = resolveAndValidatePlanPath(planPath, plansDir, tempRootDir);
      expect(result).toBe(
        path.join(plansDir, 'tracks', 'fibsqrt_20260519', 'spec.md'),
      );
    });

    it('should resolve paths relative to plansDir if they contain subdirectories', () => {
      const planPath = path.join('tracks', 'fibsqrt_20260519', 'spec.md');
      const result = resolveAndValidatePlanPath(planPath, plansDir, tempRootDir);
      expect(result).toBe(
        path.join(plansDir, 'tracks', 'fibsqrt_20260519', 'spec.md'),
      );
    });

    it('should throw access denied when escaping', () => {
      const planPath = '../../escaped.md';
      expect(() =>
        resolveAndValidatePlanPath(planPath, plansDir, tempRootDir),
      ).toThrow(/Access denied/);
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
