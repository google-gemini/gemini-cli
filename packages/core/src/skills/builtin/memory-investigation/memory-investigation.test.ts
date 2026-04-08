/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests that the memory-investigation skill is properly structured
 * and discoverable by the Gemini CLI skill loader.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadSkillsFromDir } from '../../skillLoader.js';

const SKILL_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
);

describe('memory-investigation skill', () => {
  const skillPath = path.join(
    SKILL_DIR,
    'memory-investigation',
    'SKILL.md',
  );

  describe('file structure', () => {
    it('should have SKILL.md', () => {
      expect(fs.existsSync(skillPath)).toBe(true);
    });

    it('should have references directory', () => {
      const refsDir = path.join(
        SKILL_DIR,
        'memory-investigation',
        'references',
      );
      expect(fs.existsSync(refsDir)).toBe(true);
    });

    it('should have advanced-workflows reference', () => {
      const ref = path.join(
        SKILL_DIR,
        'memory-investigation',
        'references',
        'advanced-workflows.md',
      );
      expect(fs.existsSync(ref)).toBe(true);
    });

    it('should have perfetto-sql reference', () => {
      const ref = path.join(
        SKILL_DIR,
        'memory-investigation',
        'references',
        'perfetto-sql.md',
      );
      expect(fs.existsSync(ref)).toBe(true);
    });

    it('should have scripts directory', () => {
      const scriptsDir = path.join(
        SKILL_DIR,
        'memory-investigation',
        'scripts',
      );
      expect(fs.existsSync(scriptsDir)).toBe(true);
    });

    it('should have launch-with-inspector script', () => {
      const script = path.join(
        SKILL_DIR,
        'memory-investigation',
        'scripts',
        'launch-with-inspector.cjs',
      );
      expect(fs.existsSync(script)).toBe(true);
    });
  });

  describe('SKILL.md content', () => {
    let content: string;

    it('should have valid YAML frontmatter', () => {
      content = fs.readFileSync(skillPath, 'utf-8');
      expect(content.startsWith('---\n')).toBe(true);
      expect(content.indexOf('---', 4)).toBeGreaterThan(4);
    });

    it('should have name: memory-investigation', () => {
      content = fs.readFileSync(skillPath, 'utf-8');
      expect(content).toContain('name: memory-investigation');
    });

    it('should have a description with trigger keywords', () => {
      content = fs.readFileSync(skillPath, 'utf-8');
      expect(content).toContain('description:');
      // Key trigger words the model should match on
      expect(content).toContain('memory leak');
      expect(content).toContain('heap');
      expect(content).toContain('OOM');
      expect(content).toContain('CDP');
    });

    it('should reference the investigate tool in the body', () => {
      content = fs.readFileSync(skillPath, 'utf-8');
      expect(content).toContain('`investigate`');
    });

    it('should document all 6 actions', () => {
      content = fs.readFileSync(skillPath, 'utf-8');
      expect(content).toContain('analyze_heap_snapshot');
      expect(content).toContain('diagnose_memory');
      expect(content).toContain('take_heap_snapshots');
      expect(content).toContain('capture_cpu_profile');
      expect(content).toContain('capture_memory_report');
      expect(content).toContain('export_perfetto');
    });
  });

  describe('skill loader discovery', () => {
    it('should be discoverable by loadSkillsFromDir()', async () => {
      const skills = await loadSkillsFromDir(SKILL_DIR);
      const memSkill = skills.find(
        (s) => s.name === 'memory-investigation',
      );
      expect(memSkill).toBeDefined();
      expect(memSkill!.description).toContain('memory');
      expect(memSkill!.body.length).toBeGreaterThan(100);
    });
  });
});
