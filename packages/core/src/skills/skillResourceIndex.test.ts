/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildSkillResourceIndex,
  formatSkillResourceSummary,
  loadSkillReferenceFile,
  normalizeRelativePosixPath,
  safeResolveWithinRoot,
} from './skillResourceIndex.js';

describe('skillResourceIndex', () => {
  let testRootDir: string;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'skill-resource-index-test-'),
    );
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  it('should return empty buckets for skill with only SKILL.md', async () => {
    const skillDir = path.join(testRootDir, 'only-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: x\ndescription: y\n---\n',
    );

    const index = await buildSkillResourceIndex(skillDir);
    expect(index).toEqual({
      scripts: [],
      references: [],
      assets: [],
      other: [],
    });
    expect(formatSkillResourceSummary(index)).toBe(
      'No indexed resource files under this skill (only SKILL.md or ignored dirs).',
    );
  });

  it('should classify paths into buckets', async () => {
    const skillDir = path.join(testRootDir, 'multi');
    await fs.mkdir(path.join(skillDir, 'references'), { recursive: true });
    await fs.mkdir(path.join(skillDir, 'scripts'), { recursive: true });
    await fs.mkdir(path.join(skillDir, 'assets'), { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: x\ndescription: y\n---\n',
    );
    await fs.writeFile(path.join(skillDir, 'references', 'a.md'), 'a');
    await fs.writeFile(path.join(skillDir, 'references', 'b.md'), 'b');
    await fs.writeFile(path.join(skillDir, 'scripts', 'run.sh'), 'x');
    await fs.writeFile(path.join(skillDir, 'assets', 'c.png'), 'x');
    await fs.mkdir(path.join(skillDir, 'misc'), { recursive: true });
    await fs.writeFile(path.join(skillDir, 'misc', 'd.txt'), 'd');

    const index = await buildSkillResourceIndex(skillDir);
    expect(index.references).toEqual(['references/a.md', 'references/b.md']);
    expect(index.scripts).toEqual(['scripts/run.sh']);
    expect(index.assets).toEqual(['assets/c.png']);
    expect(index.other).toEqual(['misc/d.txt']);
  });

  it('should not descend into node_modules', async () => {
    const skillDir = path.join(testRootDir, 'nm');
    await fs.mkdir(path.join(skillDir, 'node_modules', 'pkg'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(skillDir, 'node_modules', 'pkg', 'index.js'),
      'x',
    );
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: x\ndescription: y\n---\n',
    );

    const index = await buildSkillResourceIndex(skillDir);
    expect(index.scripts).toEqual([]);
    expect(index.references).toEqual([]);
    expect(index.assets).toEqual([]);
    expect(index.other).toEqual([]);
  });

  it('should read references via loadSkillReferenceFile', async () => {
    const skillDir = path.join(testRootDir, 'ref-read');
    await fs.mkdir(path.join(skillDir, 'references'), { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'references', 'doc.md'),
      'hello ref',
    );

    const content = await loadSkillReferenceFile(
      skillDir,
      'references/doc.md',
    );
    expect(content).toBe('hello ref');
  });

  it('normalizeRelativePosixPath should reject traversal and absolute paths', () => {
    expect(() => normalizeRelativePosixPath('../x')).toThrow(
      'Path traversal is not allowed',
    );
    expect(() => normalizeRelativePosixPath('references/../x')).toThrow(
      'Path traversal is not allowed',
    );
    expect(() => normalizeRelativePosixPath('/abs')).toThrow(
      'Absolute paths are not allowed',
    );
    expect(normalizeRelativePosixPath('references/a.md')).toBe(
      'references/a.md',
    );
  });

  it('loadSkillReferenceFile should reject non-references paths', async () => {
    const skillDir = path.join(testRootDir, 'nr');
    await fs.mkdir(path.join(skillDir, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(skillDir, 'scripts', 'x.sh'), 'x');

    await expect(
      loadSkillReferenceFile(skillDir, 'scripts/x.sh'),
    ).rejects.toThrow('Only references/ paths are allowed');
  });

  it('safeResolveWithinRoot should reject escape after normalization', () => {
    const root = path.join(testRootDir, 'safe');
    expect(() =>
      safeResolveWithinRoot(root, 'references/../../../etc/passwd'),
    ).toThrow('Path traversal is not allowed');
  });
});
