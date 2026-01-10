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
import { type GeminiCLIExtension } from '../config/config.js';

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

  it('should discover skills from extensions, user, and project with precedence', async () => {
    const userDir = path.join(testRootDir, 'user');
    const projectDir = path.join(testRootDir, 'project');
    await fs.mkdir(path.join(userDir, 'skill-a'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'skill-b'), { recursive: true });

    await fs.writeFile(
      path.join(userDir, 'skill-a', 'SKILL.md'),
      `---
name: skill-user
description: user-desc
---
`,
    );
    await fs.writeFile(
      path.join(projectDir, 'skill-b', 'SKILL.md'),
      `---
name: skill-project
description: project-desc
---
`,
    );

    const mockExtension: GeminiCLIExtension = {
      name: 'test-ext',
      version: '1.0.0',
      isActive: true,
      path: '/ext',
      contextFiles: [],
      id: 'ext-id',
      skills: [
        {
          name: 'skill-extension',
          description: 'ext-desc',
          location: '/ext/skills/SKILL.md',
          body: 'body',
        },
      ],
    };

    vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue(userDir);
    const storage = new Storage('/dummy');
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue(projectDir);

    const service = new SkillManager();
    await service.discoverSkills(storage, [mockExtension]);

    const skills = service.getSkills();
    expect(skills).toHaveLength(3);
    const names = skills.map((s) => s.name);
    expect(names).toContain('skill-extension');
    expect(names).toContain('skill-user');
    expect(names).toContain('skill-project');
  });

  it('should respect precedence: Project > User > Extension', async () => {
    const userDir = path.join(testRootDir, 'user');
    const projectDir = path.join(testRootDir, 'project');
    await fs.mkdir(path.join(userDir, 'skill'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'skill'), { recursive: true });

    await fs.writeFile(
      path.join(userDir, 'skill', 'SKILL.md'),
      `---
name: same-name
description: user-desc
---
`,
    );
    await fs.writeFile(
      path.join(projectDir, 'skill', 'SKILL.md'),
      `---
name: same-name
description: project-desc
---
`,
    );

    const mockExtension: GeminiCLIExtension = {
      name: 'test-ext',
      version: '1.0.0',
      isActive: true,
      path: '/ext',
      contextFiles: [],
      id: 'ext-id',
      skills: [
        {
          name: 'same-name',
          description: 'ext-desc',
          location: '/ext/skills/SKILL.md',
          body: 'body',
        },
      ],
    };

    vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue(userDir);
    const storage = new Storage('/dummy');
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue(projectDir);

    const service = new SkillManager();
    await service.discoverSkills(storage, [mockExtension]);

    const skills = service.getSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe('project-desc');

    // Test User > Extension
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue('/non-existent');
    await service.discoverSkills(storage, [mockExtension]);
    expect(service.getSkills()[0].description).toBe('user-desc');
  });

  it('should filter disabled skills in getSkills but not in getAllSkills', async () => {
    const skillDir = path.join(testRootDir, 'skill1');
    await fs.mkdir(skillDir, { recursive: true });

    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      `---
name: skill1
description: desc1
---
`,
    );

    const storage = new Storage('/dummy');
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue(testRootDir);
    vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue('/non-existent');

    const service = new SkillManager();
    await service.discoverSkills(storage);
    service.setDisabledSkills(['skill1']);

    expect(service.getSkills()).toHaveLength(0);
    expect(service.getAllSkills()).toHaveLength(1);
    expect(service.getAllSkills()[0].disabled).toBe(true);
  });

  it('should filter built-in skills in getDisplayableSkills', async () => {
    const service = new SkillManager();

    // @ts-expect-error accessing private property for testing
    service.skills = [
      {
        name: 'regular-skill',
        description: 'regular',
        location: 'loc1',
        body: 'body',
        isBuiltin: false,
      },
      {
        name: 'builtin-skill',
        description: 'builtin',
        location: 'loc2',
        body: 'body',
        isBuiltin: true,
      },
      {
        name: 'disabled-builtin',
        description: 'disabled builtin',
        location: 'loc3',
        body: 'body',
        isBuiltin: true,
        disabled: true,
      },
    ];

    const displayable = service.getDisplayableSkills();
    expect(displayable).toHaveLength(1);
    expect(displayable[0].name).toBe('regular-skill');

    const all = service.getAllSkills();
    expect(all).toHaveLength(3);

    const enabled = service.getSkills();
    expect(enabled).toHaveLength(2);
    expect(enabled.map((s) => s.name)).toContain('builtin-skill');
  });
});
