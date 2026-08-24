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
import { loadSkillsFromDir } from './skillLoader.js';

vi.mock('./skillLoader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./skillLoader.js')>();
  return {
    ...actual,
    loadSkillsFromDir: vi.fn(actual.loadSkillsFromDir),
  };
});

describe('SkillManager Alias', () => {
  let testRootDir: string;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'skill-manager-alias-test-'),
    );
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should discover skills from .agents/skills directory', async () => {
    const userGeminiDir = path.join(testRootDir, 'user', '.gemini', 'skills');
    const userAgentDir = path.join(testRootDir, 'user', '.agents', 'skills');
    const projectGeminiDir = path.join(
      testRootDir,
      'workspace',
      '.gemini',
      'skills',
    );
    const projectAgentDir = path.join(
      testRootDir,
      'workspace',
      '.agents',
      'skills',
    );

    await fs.mkdir(userGeminiDir, { recursive: true });
    await fs.mkdir(userAgentDir, { recursive: true });
    await fs.mkdir(projectGeminiDir, { recursive: true });
    await fs.mkdir(projectAgentDir, { recursive: true });

    vi.mocked(loadSkillsFromDir).mockImplementation(async (dir) => {
      if (dir === userGeminiDir) {
        return [
          {
            name: 'user-gemini',
            description: 'desc',
            location: 'loc',
            body: '',
          },
        ];
      }
      if (dir === userAgentDir) {
        return [
          {
            name: 'user-agent',
            description: 'desc',
            location: 'loc',
            body: '',
          },
        ];
      }
      if (dir === projectGeminiDir) {
        return [
          {
            name: 'project-gemini',
            description: 'desc',
            location: 'loc',
            body: '',
          },
        ];
      }
      if (dir === projectAgentDir) {
        return [
          {
            name: 'project-agent',
            description: 'desc',
            location: 'loc',
            body: '',
          },
        ];
      }
      return [];
    });

    vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue(userGeminiDir);
    vi.spyOn(Storage, 'getUserAgentSkillsDir').mockReturnValue(userAgentDir);

    const storage = new Storage(path.join(testRootDir, 'workspace'));
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue(projectGeminiDir);
    vi.spyOn(storage, 'getProjectAgentSkillsDir').mockReturnValue(
      projectAgentDir,
    );

    const service = new SkillManager();
    // @ts-expect-error accessing private method for testing
    vi.spyOn(service, 'discoverBuiltinSkills').mockResolvedValue(undefined);

    await service.discoverSkills(storage, [], true);

    const skills = service.getSkills();
    expect(skills).toHaveLength(4);
    const names = skills.map((s) => s.name);
    expect(names).toContain('user-gemini');
    expect(names).toContain('user-agent');
    expect(names).toContain('project-gemini');
    expect(names).toContain('project-agent');
  });

  it('should give .agents precedence over .gemini when in the same tier', async () => {
    const userGeminiDir = path.join(testRootDir, 'user', '.gemini', 'skills');
    const userAgentDir = path.join(testRootDir, 'user', '.agents', 'skills');

    await fs.mkdir(userGeminiDir, { recursive: true });
    await fs.mkdir(userAgentDir, { recursive: true });

    vi.mocked(loadSkillsFromDir).mockImplementation(async (dir) => {
      if (dir === userGeminiDir) {
        return [
          {
            name: 'same-skill',
            description: 'gemini-desc',
            location: 'loc-gemini',
            body: '',
          },
        ];
      }
      if (dir === userAgentDir) {
        return [
          {
            name: 'same-skill',
            description: 'agent-desc',
            location: 'loc-agent',
            body: '',
          },
        ];
      }
      return [];
    });

    vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue(userGeminiDir);
    vi.spyOn(Storage, 'getUserAgentSkillsDir').mockReturnValue(userAgentDir);

    const storage = new Storage('/dummy');
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue(
      '/non-existent-gemini',
    );
    vi.spyOn(storage, 'getProjectAgentSkillsDir').mockReturnValue(
      '/non-existent-agent',
    );

    const service = new SkillManager();
    // @ts-expect-error accessing private method for testing
    vi.spyOn(service, 'discoverBuiltinSkills').mockResolvedValue(undefined);

    await service.discoverSkills(storage, [], true);

    const skills = service.getSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe('agent-desc');
  });
});

// ---------------------------------------------------------------------------
// Regression tests for GitHub issue #28944
//
// When .gemini/skills and .agents/skills are symlinked / junctioned to the
// same physical directory, discoverSkills() must scan that directory exactly
// once and must not emit any spurious "Skill conflict detected" warnings.
// ---------------------------------------------------------------------------

/**
 * Creates a directory link (junction on Windows, symlink on POSIX).
 * Returns true if the link was created successfully, false if the platform
 * does not support the required link type or the operation was refused (e.g.
 * missing privileges).  Tests that receive `false` are skipped.
 */
async function tryCreateDirLink(
  target: string,
  linkPath: string,
): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      // 'junction' is the Windows-native directory link type that does not
      // require elevated privileges (unlike directory symlinks on Windows).
      await fs.symlink(target, linkPath, 'junction');
    } else {
      await fs.symlink(target, linkPath);
    }
    return true;
  } catch {
    return false;
  }
}

/** Writes a minimal SKILL.md file into `skillSubdir` inside `baseDir`. */
async function writeSkillFile(
  baseDir: string,
  skillSubdir: string,
  name: string,
  description: string,
): Promise<string> {
  const skillDir = path.join(baseDir, skillSubdir);
  await fs.mkdir(skillDir, { recursive: true });
  const skillFile = path.join(skillDir, 'SKILL.md');
  await fs.writeFile(
    skillFile,
    `---\nname: ${name}\ndescription: ${description}\n---\nbody`,
  );
  return skillFile;
}

describe('SkillManager — symlink/junction deduplication (#28944)', () => {
  let testRootDir: string;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'skill-manager-symlink-test-'),
    );
    // Use the real loadSkillsFromDir so the filesystem I/O is exercised.
    vi.mocked(loadSkillsFromDir).mockRestore();
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: workspace-tier — .agents/skills is a junction/symlink to .gemini/skills
  // -------------------------------------------------------------------------
  it('should not produce a conflict warning when workspace .agents/skills is linked to .gemini/skills', async () => {
    // Create the real skills directory under .gemini/skills
    const realSkillsDir = path.join(
      testRootDir,
      'workspace',
      '.gemini',
      'skills',
    );
    await writeSkillFile(
      realSkillsDir,
      'my-skill',
      'my-skill',
      'A shared skill',
    );

    // Create the .agents/skills directory as a link to the real dir
    const agentSkillsDir = path.join(
      testRootDir,
      'workspace',
      '.agents',
      'skills',
    );
    await fs.mkdir(path.dirname(agentSkillsDir), { recursive: true });
    const linked = await tryCreateDirLink(realSkillsDir, agentSkillsDir);
    if (!linked) {
      // Platform does not support the required link type — skip gracefully.
      return;
    }

    const storage = new Storage(path.join(testRootDir, 'workspace'));
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue(realSkillsDir);
    vi.spyOn(storage, 'getProjectAgentSkillsDir').mockReturnValue(
      agentSkillsDir,
    );
    vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue(
      path.join(testRootDir, 'non-existent-user'),
    );
    vi.spyOn(Storage, 'getUserAgentSkillsDir').mockReturnValue(
      path.join(testRootDir, 'non-existent-user-agent'),
    );

    const service = new SkillManager();
    // @ts-expect-error accessing private method for testing
    vi.spyOn(service, 'discoverBuiltinSkills').mockResolvedValue(undefined);

    // Spy on coreEvents to detect any spurious conflict warning.
    const { coreEvents } = await import('../utils/events.js');
    const emitSpy = vi.spyOn(coreEvents, 'emitFeedback');

    await service.discoverSkills(storage, [], true);

    const skills = service.getSkills();
    // The skill must appear exactly once.
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('my-skill');

    // No conflict warning should have been emitted.
    const warningCalls = emitSpy.mock.calls.filter(
      ([level]) => level === 'warning',
    );
    expect(warningCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 2: workspace-tier — .gemini/skills is a junction/symlink to .agents/skills
  //         (reverse arrangement)
  // -------------------------------------------------------------------------
  it('should not produce a conflict warning when workspace .gemini/skills is linked to .agents/skills', async () => {
    // Create the real skills directory under .agents/skills
    const realSkillsDir = path.join(
      testRootDir,
      'workspace',
      '.agents',
      'skills',
    );
    await writeSkillFile(
      realSkillsDir,
      'my-skill',
      'my-skill',
      'A shared skill',
    );

    // Create the .gemini/skills directory as a link to the real dir
    const geminiSkillsDir = path.join(
      testRootDir,
      'workspace',
      '.gemini',
      'skills',
    );
    await fs.mkdir(path.dirname(geminiSkillsDir), { recursive: true });
    const linked = await tryCreateDirLink(realSkillsDir, geminiSkillsDir);
    if (!linked) {
      return;
    }

    const storage = new Storage(path.join(testRootDir, 'workspace'));
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue(geminiSkillsDir);
    vi.spyOn(storage, 'getProjectAgentSkillsDir').mockReturnValue(
      realSkillsDir,
    );
    vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue(
      path.join(testRootDir, 'non-existent-user'),
    );
    vi.spyOn(Storage, 'getUserAgentSkillsDir').mockReturnValue(
      path.join(testRootDir, 'non-existent-user-agent'),
    );

    const service = new SkillManager();
    // @ts-expect-error accessing private method for testing
    vi.spyOn(service, 'discoverBuiltinSkills').mockResolvedValue(undefined);

    const { coreEvents } = await import('../utils/events.js');
    const emitSpy = vi.spyOn(coreEvents, 'emitFeedback');

    await service.discoverSkills(storage, [], true);

    const skills = service.getSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('my-skill');

    const warningCalls = emitSpy.mock.calls.filter(
      ([level]) => level === 'warning',
    );
    expect(warningCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 3: user-tier — same symlink scenario at the global (~/.gemini) level
  // -------------------------------------------------------------------------
  it('should not produce a conflict warning when user .agents/skills is linked to .gemini/skills', async () => {
    const realSkillsDir = path.join(testRootDir, 'home', '.gemini', 'skills');
    await writeSkillFile(
      realSkillsDir,
      'my-skill',
      'my-skill',
      'A shared skill',
    );

    const agentSkillsDir = path.join(testRootDir, 'home', '.agents', 'skills');
    await fs.mkdir(path.dirname(agentSkillsDir), { recursive: true });
    const linked = await tryCreateDirLink(realSkillsDir, agentSkillsDir);
    if (!linked) {
      return;
    }

    vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue(realSkillsDir);
    vi.spyOn(Storage, 'getUserAgentSkillsDir').mockReturnValue(agentSkillsDir);

    const storage = new Storage('/dummy');
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue(
      path.join(testRootDir, 'non-existent-project'),
    );
    vi.spyOn(storage, 'getProjectAgentSkillsDir').mockReturnValue(
      path.join(testRootDir, 'non-existent-project-agent'),
    );

    const service = new SkillManager();
    // @ts-expect-error accessing private method for testing
    vi.spyOn(service, 'discoverBuiltinSkills').mockResolvedValue(undefined);

    const { coreEvents } = await import('../utils/events.js');
    const emitSpy = vi.spyOn(coreEvents, 'emitFeedback');

    await service.discoverSkills(storage, [], true);

    const skills = service.getSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('my-skill');

    const warningCalls = emitSpy.mock.calls.filter(
      ([level]) => level === 'warning',
    );
    expect(warningCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 4: Different real directories must NOT be deduplicated
  // -------------------------------------------------------------------------
  it('should keep two genuinely different directories independent', async () => {
    const geminiSkillsDir = path.join(
      testRootDir,
      'workspace',
      '.gemini',
      'skills',
    );
    const agentSkillsDir = path.join(
      testRootDir,
      'workspace',
      '.agents',
      'skills',
    );
    await writeSkillFile(geminiSkillsDir, 'skill-a', 'skill-a', 'Gemini skill');
    await writeSkillFile(agentSkillsDir, 'skill-b', 'skill-b', 'Agent skill');

    const storage = new Storage(path.join(testRootDir, 'workspace'));
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue(geminiSkillsDir);
    vi.spyOn(storage, 'getProjectAgentSkillsDir').mockReturnValue(
      agentSkillsDir,
    );
    vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue(
      path.join(testRootDir, 'non-existent-user'),
    );
    vi.spyOn(Storage, 'getUserAgentSkillsDir').mockReturnValue(
      path.join(testRootDir, 'non-existent-user-agent'),
    );

    const service = new SkillManager();
    // @ts-expect-error accessing private method for testing
    vi.spyOn(service, 'discoverBuiltinSkills').mockResolvedValue(undefined);

    await service.discoverSkills(storage, [], true);

    const skills = service.getSkills();
    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name);
    expect(names).toContain('skill-a');
    expect(names).toContain('skill-b');
  });

  // -------------------------------------------------------------------------
  // Test 5: Genuine duplicate skill definitions still trigger a warning
  // (fix must NOT suppress real conflicts)
  // -------------------------------------------------------------------------
  it('should still emit a conflict warning for genuinely different directories with the same skill name', async () => {
    const geminiSkillsDir = path.join(
      testRootDir,
      'workspace',
      '.gemini',
      'skills',
    );
    const agentSkillsDir = path.join(
      testRootDir,
      'workspace',
      '.agents',
      'skills',
    );
    // Both real directories contain a skill with the same name.
    await writeSkillFile(
      geminiSkillsDir,
      'shared-skill',
      'shared-skill',
      'From gemini',
    );
    await writeSkillFile(
      agentSkillsDir,
      'shared-skill',
      'shared-skill',
      'From agents',
    );

    const storage = new Storage(path.join(testRootDir, 'workspace'));
    vi.spyOn(storage, 'getProjectSkillsDir').mockReturnValue(geminiSkillsDir);
    vi.spyOn(storage, 'getProjectAgentSkillsDir').mockReturnValue(
      agentSkillsDir,
    );
    vi.spyOn(Storage, 'getUserSkillsDir').mockReturnValue(
      path.join(testRootDir, 'non-existent-user'),
    );
    vi.spyOn(Storage, 'getUserAgentSkillsDir').mockReturnValue(
      path.join(testRootDir, 'non-existent-user-agent'),
    );

    const service = new SkillManager();
    // @ts-expect-error accessing private method for testing
    vi.spyOn(service, 'discoverBuiltinSkills').mockResolvedValue(undefined);

    const { coreEvents } = await import('../utils/events.js');
    const emitSpy = vi.spyOn(coreEvents, 'emitFeedback');

    await service.discoverSkills(storage, [], true);

    // One skill in the map (the later one wins per precedence).
    const skills = service.getSkills();
    expect(skills).toHaveLength(1);

    // A conflict warning must still be emitted.
    const warningCalls = emitSpy.mock.calls.filter(
      ([level]) => level === 'warning',
    );
    expect(warningCalls.length).toBeGreaterThan(0);
  });
});
