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

  it('should load real built-in antigravity-support skill successfully', async () => {
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const builtinDir = path.resolve(__dirname, 'builtin');
    const skills = await loadSkillsFromDir(builtinDir);
    const antigravitySkill = skills.find(
      (s) => s.name === 'antigravity-support',
    );
    expect(antigravitySkill).toBeDefined();
    expect(antigravitySkill!.description).toContain('Antigravity CLI');
    expect(antigravitySkill!.body).toContain(
      'https://antigravity.google/docs/cli-getting-started',
    );
  });

  it('should handle UTF-8 BOM in SKILL.md', async () => {
    const skillDir = path.join(testRootDir, 'bom-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `\uFEFF---\nname: bom-skill\ndescription: A single line description that is relatively long and contains some punctuation.\n---\n# Instructions\nBody\n`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('bom-skill');
    expect(skills[0].description).toBe(
      'A single line description that is relatively long and contains some punctuation.',
    );
    expect(skills[0].body).toBe('# Instructions\nBody');
  });

  it('should handle UTF-16 LE BOM in SKILL.md', async () => {
    const skillDir = path.join(testRootDir, 'utf16le-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    const text = `---\r\nname: utf16le-skill\r\ndescription: Single line description saved in UTF-16 LE.\r\n---\r\n# Test Skill\r\nContent here.\r\n`;
    const utf16leBuffer = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(text, 'utf16le'),
    ]);
    await fs.writeFile(skillFile, utf16leBuffer);

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('utf16le-skill');
    expect(skills[0].description).toBe(
      'Single line description saved in UTF-16 LE.',
    );
    expect(skills[0].body).toBe('# Test Skill\r\nContent here.');
  });

  it('should handle trailing spaces after frontmatter markers without dropping body', async () => {
    const skillDir = path.join(testRootDir, 'space-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---  \nname: space-skill\ndescription: A skill with trailing spaces\n--- \n# Instructions\nBody\n`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('space-skill');
    expect(skills[0].description).toBe('A skill with trailing spaces');
    expect(skills[0].body).toBe('# Instructions\nBody');
  });

  it('should not swallow subsequent keys into single-line description in fallback parser', async () => {
    const skillDir = path.join(testRootDir, 'swallow-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---
  description: A single line description: with a colon.
  version: 1.0.0
  name: my-skill
---
# Test Skill
Content here.
`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('my-skill');
    expect(skills[0].description).toBe(
      'A single line description: with a colon.',
    );
  });

  it('should strip outer quotes from name and description in fallback parser', async () => {
    const skillDir = path.join(testRootDir, 'quoted-fallback-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---
name: "test-skill"
description: "A single line description with "inner" quotes: and a colon"
---
`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('test-skill');
    expect(skills[0].description).toBe(
      'A single line description with "inner" quotes: and a colon',
    );
  });

  it('should handle space before colon and case-insensitivity in fallback parser', async () => {
    const skillDir = path.join(testRootDir, 'case-space-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---
Name : robust-name
DESCRIPTION : robust: description
---
`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('robust-name');
    expect(skills[0].description).toBe('robust: description');
  });

  it('should not treat "Note:" as a new key in multi-line description in fallback parser', async () => {
    const skillDir = path.join(testRootDir, 'note-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---
name: note-skill
description: This is a description
  Note: This should be part of the description
---
`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('note-skill');
    expect(skills[0].description).toBe(
      'This is a description Note: This should be part of the description',
    );
  });

  it('should handle unindented wrapped description lines and block scalar indicators in fallback parser', async () => {
    const wrappedDir = path.join(testRootDir, 'wrapped-skill');
    await fs.mkdir(wrappedDir, { recursive: true });
    await fs.writeFile(
      path.join(wrappedDir, 'SKILL.md'),
      `---
description: A single line description that is relatively long
and wraps onto the next line without indentation.
name: wrapped-skill
---
`,
    );

    const foldedDir = path.join(testRootDir, 'folded-fallback-skill');
    await fs.mkdir(foldedDir, { recursive: true });
    await fs.writeFile(
      path.join(foldedDir, 'SKILL.md'),
      `---
name: folded-skill
description: >
  A multi-line description: with an unquoted colon on an unindented line
and another line.
---
`,
    );

    const skills = await loadSkillsFromDir(testRootDir);

    const wrapped = skills.find((s) => s.name === 'wrapped-skill');
    expect(wrapped).toBeDefined();
    expect(wrapped!.description).toBe(
      'A single line description that is relatively long and wraps onto the next line without indentation.',
    );

    const folded = skills.find((s) => s.name === 'folded-skill');
    expect(folded).toBeDefined();
    expect(folded!.description).toBe(
      'A multi-line description: with an unquoted colon on an unindented line and another line.',
    );
  });
});
