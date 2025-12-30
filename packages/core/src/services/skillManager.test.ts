/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { SkillManager } from './skillManager.js';
import { Storage } from '../config/storage.js';

describe('SkillManager', () => {
  let testRootDir: string;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'skill-manager-test-'),
    );
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
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
    const skills = await service.discoverSkillsInternal([testRootDir]);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('my-skill');
    expect(skills[0].description).toBe('A test skill');
    expect(skills[0].location).toBe(skillFile);
    expect(skills[0].body).toBe('# Instructions\nDo something.');
  });

  it('should ignore directories without SKILL.md', async () => {
    const notASkillDir = path.join(testRootDir, 'not-a-skill');
    await fs.mkdir(notASkillDir, { recursive: true });

    const service = new SkillManager();
    const skills = await service.discoverSkillsInternal([testRootDir]);

    expect(skills).toHaveLength(0);
  });

  it('should ignore SKILL.md without valid frontmatter', async () => {
    const skillDir = path.join(testRootDir, 'invalid-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(skillFile, '# No frontmatter here');

    const service = new SkillManager();
    const skills = await service.discoverSkillsInternal([testRootDir]);

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
    const skills = await service.discoverSkillsInternal([testRootDir]);

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
    const skills = await service.discoverSkillsInternal([path1, path2]);

    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(['skill1', 'skill2']);
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
    // In our tiered discovery logic, we call discoverSkillsInternal for each tier
    // and then add them with precedence.
    const skills1 = await service.discoverSkillsInternal([path1]);
    service['addSkillsWithPrecedence'](skills1);
    const skills2 = await service.discoverSkillsInternal([path2]);
    service['addSkillsWithPrecedence'](skills2);

    const skills = service.getSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe('Second');
  });

  it('should discover skills from Storage with project precedence', async () => {
    const userDir = path.join(testRootDir, 'user');
    const projectDir = path.join(testRootDir, 'project');
    await fs.mkdir(path.join(userDir, 'skill-a'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'skill-a'), { recursive: true });

    await fs.writeFile(
      path.join(userDir, 'skill-a', 'SKILL.md'),
      `---
name: skill-a
description: user-desc
---
`,
    );
    await fs.writeFile(
      path.join(projectDir, 'skill-a', 'SKILL.md'),
      `---
name: skill-a
description: project-desc
---
`,
    );

    vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue(userDir);
    const storage = new Storage('/dummy');
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue(projectDir);

    const service = new SkillManager();
    await service.discoverSkills(storage);

    const skills = service.getSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe('project-desc');
  });

  it('should filter disabled skills in getSkills but not in getAllSkills', async () => {
    const skill1Dir = path.join(testRootDir, 'skill1');
    const skill2Dir = path.join(testRootDir, 'skill2');
    await fs.mkdir(skill1Dir, { recursive: true });
    await fs.mkdir(skill2Dir, { recursive: true });

    await fs.writeFile(
      path.join(skill1Dir, 'SKILL.md'),
      `---
name: skill1
description: desc1
---
`,
    );
    await fs.writeFile(
      path.join(skill2Dir, 'SKILL.md'),
      `---
name: skill2
description: desc2
---
`,
    );

    const service = new SkillManager();
    const discovered = await service.discoverSkillsInternal([testRootDir]);
    service['addSkillsWithPrecedence'](discovered);
    service.setDisabledSkills(['skill1']);

    expect(service.getSkills()).toHaveLength(1);
    expect(service.getSkills()[0].name).toBe('skill2');
    expect(service.getAllSkills()).toHaveLength(2);
    expect(
      service.getAllSkills().find((s) => s.name === 'skill1')?.disabled,
    ).toBe(true);
  });
});
