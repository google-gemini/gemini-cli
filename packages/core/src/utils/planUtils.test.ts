/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import * as fs from 'node:fs';
import { validatePlanPath, validatePlanContent } from './planUtils.js';
import * as fileUtils from './fileUtils.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

vi.mock('./fileUtils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof fileUtils>();
  return {
    ...actual,
    isWithinRoot: vi.fn(),
    getRealPathSync: vi.fn(),
    isEmpty: vi.fn(),
  };
});

describe('planUtils', () => {
  const mockTargetDir = '/mock/dir';
  const mockPlansDir = '/mock/dir/plans';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validatePlanPath', () => {
    it('should return null for a valid path within plans directory', () => {
      const planPath = 'plans/test.md';
      const resolvedPath = path.resolve(mockTargetDir, planPath);

      vi.mocked(fileUtils.getRealPathSync).mockReturnValue(resolvedPath);
      vi.mocked(fileUtils.isWithinRoot).mockReturnValue(true);
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = validatePlanPath(planPath, mockPlansDir, mockTargetDir);
      expect(result).toBeNull();
    });

    it('should return error for path traversal', () => {
      const planPath = '../secret.txt';
      const resolvedPath = path.resolve(mockTargetDir, planPath);

      vi.mocked(fileUtils.getRealPathSync).mockReturnValue(resolvedPath);
      vi.mocked(fileUtils.isWithinRoot).mockReturnValue(false);

      const result = validatePlanPath(planPath, mockPlansDir, mockTargetDir);
      expect(result).toContain('Access denied');
    });

    it('should return error for non-existent file', () => {
      const planPath = 'plans/ghost.md';
      const resolvedPath = path.resolve(mockTargetDir, planPath);

      vi.mocked(fileUtils.getRealPathSync).mockReturnValue(resolvedPath);
      vi.mocked(fileUtils.isWithinRoot).mockReturnValue(true);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = validatePlanPath(planPath, mockPlansDir, mockTargetDir);
      expect(result).toContain('Plan file does not exist');
    });
  });

  describe('validatePlanContent', () => {
    it('should return null for non-empty content', async () => {
      vi.mocked(fileUtils.isEmpty).mockResolvedValue(false);
      const result = await validatePlanContent('plans/test.md');
      expect(result).toBeNull();
    });

    it('should return error for empty content', async () => {
      vi.mocked(fileUtils.isEmpty).mockResolvedValue(true);
      const result = await validatePlanContent('plans/test.md');
      expect(result).toContain('Plan file is empty');
    });

    it('should return error for unreadable file', async () => {
      vi.mocked(fileUtils.isEmpty).mockRejectedValue(new Error('Read error'));
      const result = await validatePlanContent('plans/test.md');
      expect(result).toContain('Failed to read plan file');
    });
  });
});
