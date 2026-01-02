/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { SkillLoader } from './skillLoader.js';

describe('SkillLoader', () => {
  let testRootDir: string;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'skill-loader-test-'),
    );
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should load skills from a directory with valid SKILL.md', async () => {
    const skillDir = path.join(testRootDir, 'my-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---\nname: my-skill\ndescription: A test skill\n---\n# Instructions\nDo something.\n`,
    );

    const skills = await SkillLoader.loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('my-skill');
    expect(skills[0].description).toBe('A test skill');
    expect(skills[0].location).toBe(skillFile);
    expect(skills[0].body).toBe('# Instructions\nDo something.');
  });

  it('should ignore directories without SKILL.md', async () => {
    const notASkillDir = path.join(testRootDir, 'not-a-skill');
    await fs.mkdir(notASkillDir, { recursive: true });

    const skills = await SkillLoader.loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(0);
  });

  it('should ignore SKILL.md without valid frontmatter', async () => {
    const skillDir = path.join(testRootDir, 'invalid-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(skillFile, '# No frontmatter here');

    const skills = await SkillLoader.loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(0);
  });

  it('should return empty array for non-existent directory', async () => {
    const skills = await SkillLoader.loadSkillsFromDir('/non/existent/path');
    expect(skills).toEqual([]);
  });
});
