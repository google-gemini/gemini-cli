/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadSkillsFromDir } from './skillLoader.js';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';

describe('skillLoader', () => {
  let testRootDir: string;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'skill-loader-test-'),
    );
    vi.spyOn(coreEvents, 'emitFeedback');
    vi.spyOn(debugLogger, 'debug').mockImplementation(() => {});
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

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('my-skill');
    expect(skills[0].description).toBe('A test skill');
    expect(skills[0].location).toBe(skillFile);
    expect(skills[0].body).toBe('# Instructions\nDo something.');
    expect(coreEvents.emitFeedback).not.toHaveBeenCalled();
  });

  it('should emit feedback when no valid skills are found in a non-empty directory', async () => {
    const notASkillDir = path.join(testRootDir, 'not-a-skill');
    await fs.mkdir(notASkillDir, { recursive: true });
    await fs.writeFile(path.join(notASkillDir, 'some-file.txt'), 'hello');

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(0);
    expect(debugLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load skills from'),
    );
  });

  it('should ignore empty directories and not emit feedback', async () => {
    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(0);
    expect(coreEvents.emitFeedback).not.toHaveBeenCalled();
  });

  it('should ignore directories without SKILL.md', async () => {
    const notASkillDir = path.join(testRootDir, 'not-a-skill');
    await fs.mkdir(notASkillDir, { recursive: true });

    // With a subdirectory, even if empty, it might still trigger readdir
    // But my current logic is if discoveredSkills.length === 0, then check readdir
    // If readdir is empty, it's fine.

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(0);
    // If notASkillDir is empty, no warning.
  });

  it('should ignore SKILL.md without valid frontmatter and emit warning if directory is not empty', async () => {
    const skillDir = path.join(testRootDir, 'invalid-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(skillFile, '# No frontmatter here');

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(0);
    expect(debugLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load skills from'),
    );
  });

  it('should return empty array for non-existent directory', async () => {
    const skills = await loadSkillsFromDir('/non/existent/path');
    expect(skills).toEqual([]);
    expect(coreEvents.emitFeedback).not.toHaveBeenCalled();
  });
});
