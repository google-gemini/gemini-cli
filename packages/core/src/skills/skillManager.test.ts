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
import { loadSkillsFromDir, type SkillDefinition } from './skillLoader.js';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';

vi.mock('./skillLoader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./skillLoader.js')>();
  return {
    ...actual,
    loadSkillsFromDir: vi.fn(actual.loadSkillsFromDir),
  };
});

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

  it('should discover skills from extensions, user, and workspace with precedence', async () => {
    const userDir = path.join(testRootDir, 'user');
    const projectDir = path.join(testRootDir, 'workspace');
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
    // @ts-expect-error accessing private method for testing
    vi.spyOn(service, 'discoverBuiltinSkills').mockResolvedValue(undefined);
    await service.discoverSkills(storage, [mockExtension]);

    const skills = service.getSkills();
    expect(skills).toHaveLength(3);
    const names = skills.map((s) => s.name);
    expect(names).toContain('skill-extension');
    expect(names).toContain('skill-user');
    expect(names).toContain('skill-project');
  });

  it('should respect precedence: Workspace > User > Extension', async () => {
    const userDir = path.join(testRootDir, 'user');
    const projectDir = path.join(testRootDir, 'workspace');
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
    // @ts-expect-error accessing private method for testing
    vi.spyOn(service, 'discoverBuiltinSkills').mockResolvedValue(undefined);
    await service.discoverSkills(storage, [mockExtension]);

    const skills = service.getSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe('project-desc');

    // Test User > Extension
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue('/non-existent');
    await service.discoverSkills(storage, [mockExtension]);
    expect(service.getSkills()[0].description).toBe('user-desc');
  });

  it('should discover built-in skills', async () => {
    const service = new SkillManager();
    const mockBuiltinSkill: SkillDefinition = {
      name: 'builtin-skill',
      description: 'builtin-desc',
      location: 'builtin-loc',
      body: 'builtin-body',
    };

    vi.mocked(loadSkillsFromDir).mockImplementation(async (dir) => {
      if (dir.endsWith('builtin')) {
        return [{ ...mockBuiltinSkill }];
      }
      return [];
    });

    const storage = new Storage('/dummy');
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue('/non-existent');
    vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue('/non-existent');

    await service.discoverSkills(storage);

    const skills = service.getSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('builtin-skill');
    expect(skills[0].isBuiltin).toBe(true);
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
body1`,
    );

    const storage = new Storage('/dummy');
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue(testRootDir);
    vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue('/non-existent');

    const service = new SkillManager();
    // @ts-expect-error accessing private method for testing
    vi.spyOn(service, 'discoverBuiltinSkills').mockResolvedValue(undefined);
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

  it('should maintain admin settings state', async () => {
    const service = new SkillManager();

    // Case 1: Enabled by admin

    service.setAdminSettings(true);

    expect(service.isAdminEnabled()).toBe(true);

    // Case 2: Disabled by admin

    service.setAdminSettings(false);

    expect(service.isAdminEnabled()).toBe(false);
  });

  describe('Conflict Detection', () => {
    it('should emit UI warning when a non-built-in skill is overridden', async () => {
      const emitFeedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');
      const userDir = path.join(testRootDir, 'user');
      const projectDir = path.join(testRootDir, 'workspace');
      await fs.mkdir(userDir, { recursive: true });
      await fs.mkdir(projectDir, { recursive: true });

      const skillName = 'conflicting-skill';
      const userSkillPath = path.join(userDir, 'SKILL.md');
      const projectSkillPath = path.join(projectDir, 'SKILL.md');

      vi.mocked(loadSkillsFromDir).mockImplementation(async (dir) => {
        if (dir === userDir) {
          return [
            {
              name: skillName,
              description: 'user-desc',
              location: userSkillPath,
              body: '',
            },
          ];
        }
        if (dir === projectDir) {
          return [
            {
              name: skillName,
              description: 'project-desc',
              location: projectSkillPath,
              body: '',
            },
          ];
        }
        return [];
      });

      vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue(userDir);
      const storage = new Storage('/dummy');
      vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue(projectDir);

      const service = new SkillManager();
      // @ts-expect-error accessing private method for testing
      vi.spyOn(service, 'discoverBuiltinSkills').mockResolvedValue(undefined);

      await service.discoverSkills(storage, []);

      expect(emitFeedbackSpy).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining(
          `Skill conflict detected: "${skillName}" from "${projectSkillPath}" is overriding the same skill from "${userSkillPath}".`,
        ),
      );
    });

    it('should log warning but NOT emit UI warning when a built-in skill is overridden', async () => {
      const emitFeedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');
      const debugWarnSpy = vi.spyOn(debugLogger, 'warn');
      const userDir = path.join(testRootDir, 'user');
      await fs.mkdir(userDir, { recursive: true });

      const skillName = 'builtin-skill';
      const userSkillPath = path.join(userDir, 'SKILL.md');
      const builtinSkillPath = 'builtin/loc';

      vi.mocked(loadSkillsFromDir).mockImplementation(async (dir) => {
        if (dir.endsWith('builtin')) {
          return [
            {
              name: skillName,
              description: 'builtin-desc',
              location: builtinSkillPath,
              body: '',
              isBuiltin: true,
            },
          ];
        }
        if (dir === userDir) {
          return [
            {
              name: skillName,
              description: 'user-desc',
              location: userSkillPath,
              body: '',
            },
          ];
        }
        return [];
      });

      vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue(userDir);
      const storage = new Storage('/dummy');
      vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue('/non-existent');

      const service = new SkillManager();

      await service.discoverSkills(storage, []);

      // UI warning should not be called
      expect(emitFeedbackSpy).not.toHaveBeenCalled();

      // Debug warning should be called
      expect(debugWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `Skill "${skillName}" from "${userSkillPath}" is overriding the built-in skill.`,
        ),
      );
    });
  });
});
