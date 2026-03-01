/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import * as fs from 'node:fs';
import os from 'node:os';
import { validatePlanPath, validatePlanContent } from './planUtils.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    realpathSync: vi.fn(actual.realpathSync),
    existsSync: vi.fn(actual.existsSync),
  };
});

describe('planUtils', () => {
  let tempRootDir: string;
  let plansDir: string;
  let actualFs: typeof import('node:fs');

  beforeEach(async () => {
    actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    tempRootDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'planUtils-test-')),
    );
    const plansDirRaw = path.join(tempRootDir, 'plans');
    fs.mkdirSync(plansDirRaw, { recursive: true });
    plansDir = fs.realpathSync(plansDirRaw);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (actualFs.existsSync(tempRootDir)) {
      actualFs.rmSync(tempRootDir, { recursive: true, force: true });
    }
  });

  describe('validatePlanPath', () => {
    it('should return null for a valid path within plans directory', async () => {
      const planPath = path.join('plans', 'test.md');
      const fullPath = path.join(tempRootDir, planPath);
      fs.writeFileSync(fullPath, '# My Plan');

      const result = await validatePlanPath(planPath, plansDir, tempRootDir);
      expect(result).toBeNull();
    });

    it('should return error for path traversal', async () => {
      const planPath = path.join('..', 'secret.txt');
      const result = await validatePlanPath(planPath, plansDir, tempRootDir);
      expect(result).toContain('Access denied');
    });

    it('should return error for non-existent file', async () => {
      const planPath = path.join('plans', 'ghost.md');
      const result = await validatePlanPath(planPath, plansDir, tempRootDir);
      expect(result).toContain('Plan file does not exist');
    });

    it('should detect path traversal via symbolic links', async () => {
      const maliciousPath = path.join('plans', 'malicious.md');
      const fullMaliciousPath = path.join(tempRootDir, maliciousPath);
      const outsideFile = path.join(tempRootDir, 'outside.txt');
      fs.writeFileSync(outsideFile, 'secret content');

      // On Windows, symlinkSync often fails without admin rights.
      // We mock the filesystem behavior to simulate a malicious symlink.
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        if (p.toString() === fullMaliciousPath) return true;
        return actualFs.existsSync(p);
      });
      vi.mocked(fs.realpathSync).mockImplementation((p: fs.PathLike) => {
        if (p.toString() === fullMaliciousPath) return outsideFile;
        return actualFs.realpathSync(p);
      });

      const result = await validatePlanPath(
        maliciousPath,
        plansDir,
        tempRootDir,
      );
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
