/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadSkillsFromDir,
  loadSkillsFromDirWithReport,
  loadSkillFromFile,
} from './skillLoader.js';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';

describe('skillLoader', () => {
  let testRootDir: string;
  let tempHomeDir: string;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'skill-loader-test-'),
    );
    tempHomeDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'skill-loader-home-'),
    );
    vi.stubEnv('GEMINI_CLI_HOME', tempHomeDir);
    vi.spyOn(coreEvents, 'emitFeedback');
    vi.spyOn(debugLogger, 'debug').mockImplementation(() => {});
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
    await fs.rm(tempHomeDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
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

  it('should parse skill with colon in description (issue #16323)', async () => {
    const skillDir = path.join(testRootDir, 'colon-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---
name: foo
description: Simple story generation assistant for fiction writing. Use for creating characters, scenes, storylines, and prose. Trigger words: character, scene, storyline, story, prose, fiction, writing.
---
# Instructions
Do something.
`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('foo');
    expect(skills[0].description).toContain('Trigger words:');
  });

  it('should parse skill with multiple colons in description', async () => {
    const skillDir = path.join(testRootDir, 'multi-colon-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---
name: multi-colon
description: Use this for tasks like: coding, reviewing, testing. Keywords: async, await, promise.
---
# Instructions
Do something.
`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('multi-colon');
    expect(skills[0].description).toContain('tasks like:');
    expect(skills[0].description).toContain('Keywords:');
  });

  it('should parse skill with quoted YAML description (backward compatibility)', async () => {
    const skillDir = path.join(testRootDir, 'quoted-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---
name: quoted-skill
description: "A skill with colons: like this one: and another."
---
# Instructions
Do something.
`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('quoted-skill');
    expect(skills[0].description).toBe(
      'A skill with colons: like this one: and another.',
    );
  });

  it('should parse skill with multi-line YAML description', async () => {
    const skillDir = path.join(testRootDir, 'multiline-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---
name: multiline-skill
description:
  Expertise in reviewing code for style, security, and performance. Use when the
  user asks for "feedback," a "review," or to "check" their changes.
---
# Instructions
Do something.
`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('multiline-skill');
    expect(skills[0].description).toContain('Expertise in reviewing code');
    expect(skills[0].description).toContain('check');
  });

  it('should handle empty name or description', async () => {
    const skillDir = path.join(testRootDir, 'empty-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---
name: 
description: 
---
`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('');
    expect(skills[0].description).toBe('');
  });

  it('should handle indented name and description fields', async () => {
    const skillDir = path.join(testRootDir, 'indented-fields');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---
  name: indented-name
  description: indented-desc
---
`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('indented-name');
    expect(skills[0].description).toBe('indented-desc');
  });

  it('should handle missing space after colon', async () => {
    const skillDir = path.join(testRootDir, 'no-space');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---
name:no-space-name
description:no-space-desc
---
`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('no-space-name');
    expect(skills[0].description).toBe('no-space-desc');
  });

  it('should sanitize skill names containing invalid filename characters', async () => {
    const skillFile = path.join(testRootDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---
name: gke:prs-troubleshooter
description: Test sanitization
---
`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('gke-prs-troubleshooter');
  });

  it('should report load timings for discovered skills', async () => {
    const skillDir = path.join(testRootDir, 'timed-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---\nname: timed-skill\ndescription: A timed skill\n---\nBody\n`,
    );

    const result = await loadSkillsFromDirWithReport(testRootDir);

    expect(result.skills).toHaveLength(1);
    expect(result.report.skill_count).toBe(1);
    expect(result.report.invalid_count).toBe(0);
    expect(result.report.total_duration_ms).toBeGreaterThanOrEqual(0);
    expect(result.report.glob_duration_ms).toBeGreaterThanOrEqual(0);
    expect(result.report.skill_metrics).toEqual([
      expect.objectContaining({
        name: 'timed-skill',
        location: skillFile,
        parse_result: 'loaded',
      }),
    ]);
    expect(result.skills[0].loadMetadata).toEqual(
      expect.objectContaining({
        name: 'timed-skill',
        location: skillFile,
        parse_result: 'loaded',
      }),
    );
  });

  it('should report invalid skills in discovery metrics', async () => {
    const skillDir = path.join(testRootDir, 'broken-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(skillFile, 'broken');

    const result = await loadSkillsFromDirWithReport(testRootDir);

    expect(result.skills).toHaveLength(0);
    expect(result.report.skill_count).toBe(0);
    expect(result.report.invalid_count).toBe(1);
    expect(result.report.skill_metrics).toEqual([
      expect.objectContaining({
        location: skillFile,
        parse_result: 'invalid_frontmatter',
      }),
    ]);
  });

  it('should mark direct skill loads as uncached instrumentation', async () => {
    const skillDir = path.join(testRootDir, 'instrumented-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---\nname: instrumented-skill\ndescription: Instrument me\n---\nBody\n`,
    );

    const loaded = await loadSkillFromFile(skillFile);

    expect(loaded.skill?.name).toBe('instrumented-skill');
    expect(loaded.metric.cache_status).toBe('bypass');
  });

  it('should reload updated skill metadata after file changes', async () => {
    const skillDir = path.join(testRootDir, 'changed-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---\nname: changed-skill\ndescription: First\n---\nBody\n`,
    );

    await loadSkillFromFile(skillFile);
    await fs.writeFile(
      skillFile,
      `---\nname: changed-skill\ndescription: Second\n---\nBody changed\n`,
    );

    const reloaded = await loadSkillFromFile(skillFile);

    expect(reloaded.metric.cache_status).toBe('bypass');
    expect(reloaded.skill?.description).toBe('Second');
  });

  it('should discover skills through linked directories', async () => {
    const targetDir = path.join(testRootDir, 'remote-target-skill');
    await fs.mkdir(targetDir, { recursive: true });
    const targetSkillFile = path.join(targetDir, 'SKILL.md');
    await fs.writeFile(
      targetSkillFile,
      `---\nname: linked-skill\ndescription: Linked directory skill\n---\nBody\n`,
    );

    const linkedDir = path.join(testRootDir, 'linked-skill');
    if (process.platform === 'win32') {
      await fs.symlink(targetDir, linkedDir, 'junction');
    } else {
      await fs.symlink(targetDir, linkedDir, 'dir');
    }

    const result = await loadSkillsFromDirWithReport(testRootDir);

    expect(result.skills.map((skill) => skill.name)).toContain('linked-skill');
    expect(
      result.report.skill_metrics.some(
        (metric) =>
          metric.name === 'linked-skill' && metric.parse_result === 'loaded',
      ),
    ).toBe(true);
  });
});
