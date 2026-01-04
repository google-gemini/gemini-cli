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
});
