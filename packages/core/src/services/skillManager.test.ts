/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { SkillManager } from './skillManager.js';

describe('SkillManager', () => {
  let testRootDir: string;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'skill-manager-test-'),
    );
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  it('should discover skills with valid SKILL.md and frontmatter', async () => {
    const skillDir = path.join(testRootDir, 'my-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---
name: my-skill
description: A test skill
---
# Instructions
Do something.
`,
    );

    const service = new SkillManager();
    const skills = await service.discoverSkills([testRootDir]);

    expect(skills).toHaveLength(1);
    expect(skills[0]).toEqual({
      name: 'my-skill',
      description: 'A test skill',
      location: skillFile,
    });
  });

  it('should ignore directories without SKILL.md', async () => {
    const notASkillDir = path.join(testRootDir, 'not-a-skill');
    await fs.mkdir(notASkillDir, { recursive: true });

    const service = new SkillManager();
    const skills = await service.discoverSkills([testRootDir]);

    expect(skills).toHaveLength(0);
  });

  it('should ignore SKILL.md without valid frontmatter', async () => {
    const skillDir = path.join(testRootDir, 'invalid-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(skillFile, '# No frontmatter here');

    const service = new SkillManager();
    const skills = await service.discoverSkills([testRootDir]);

    expect(skills).toHaveLength(0);
  });

  it('should ignore SKILL.md with missing required frontmatter fields', async () => {
    const skillDir = path.join(testRootDir, 'missing-fields');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(
      skillFile,
      `---
name: missing-fields
---
`,
    );

    const service = new SkillManager();
    const skills = await service.discoverSkills([testRootDir]);

    expect(skills).toHaveLength(0);
  });

  it('should handle multiple search paths', async () => {
    const path1 = path.join(testRootDir, 'path1');
    const path2 = path.join(testRootDir, 'path2');
    await fs.mkdir(path1, { recursive: true });
    await fs.mkdir(path2, { recursive: true });

    const skill1Dir = path.join(path1, 'skill1');
    await fs.mkdir(skill1Dir, { recursive: true });
    await fs.writeFile(
      path.join(skill1Dir, 'SKILL.md'),
      `---
name: skill1
description: Skill 1
---
`,
    );

    const skill2Dir = path.join(path2, 'skill2');
    await fs.mkdir(skill2Dir, { recursive: true });
    await fs.writeFile(
      path.join(skill2Dir, 'SKILL.md'),
      `---
name: skill2
description: Skill 2
---
`,
    );

    const service = new SkillManager();
    const skills = await service.discoverSkills([path1, path2]);

    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(['skill1', 'skill2']);
  });

  it('should de-duplicate skills by location', async () => {
    const skillDir = path.join(testRootDir, 'skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---
name: skill
description: Skill
---
`,
    );

    const service = new SkillManager();
    // Use the same path twice
    const skills = await service.discoverSkills([testRootDir, testRootDir]);

    expect(skills).toHaveLength(1);
  });

  it('should deduplicate skills by name (last wins)', async () => {
    const path1 = path.join(testRootDir, 'path1');
    const path2 = path.join(testRootDir, 'path2');
    await fs.mkdir(path1, { recursive: true });
    await fs.mkdir(path2, { recursive: true });

    await fs.mkdir(path.join(path1, 'skill'), { recursive: true });
    await fs.writeFile(
      path.join(path1, 'skill', 'SKILL.md'),
      `---
name: same-name
description: First
---
`,
    );

    await fs.mkdir(path.join(path2, 'skill'), { recursive: true });
    await fs.writeFile(
      path.join(path2, 'skill', 'SKILL.md'),
      `---
name: same-name
description: Second
---
`,
    );

    const service = new SkillManager();
    await service.discoverSkills([path1, path2]);

    const skills = service.getSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe('Second');
  });

  it('should filter disabled skills in getSkills but not in getAllSkills', async () => {
    const skill1Dir = path.join(testRootDir, 'skill1');
    const skill2Dir = path.join(testRootDir, 'skill2');
    await fs.mkdir(skill1Dir, { recursive: true });
    await fs.mkdir(skill2Dir, { recursive: true });

    await fs.writeFile(
      path.join(skill1Dir, 'SKILL.md'),
      '---\nname: skill1\ndescription: desc1\n---\n',
    );
    await fs.writeFile(
      path.join(skill2Dir, 'SKILL.md'),
      '---\nname: skill2\ndescription: desc2\n---\n',
    );

    const service = new SkillManager();
    await service.discoverSkills([testRootDir]);
    service.setDisabledSkills(['skill1']);

    expect(service.getSkills()).toHaveLength(1);
    expect(service.getSkills()[0].name).toBe('skill2');
    expect(service.getAllSkills()).toHaveLength(2);
    expect(
      service.getAllSkills().find((s) => s.name === 'skill1')?.disabled,
    ).toBe(true);
  });
});
