/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Config } from '../config/config.js';
import { Storage } from '../config/storage.js';
import {
  addMemory,
  dismissInboxSkill,
  listInboxSkills,
  listMemoryFiles,
  moveInboxSkill,
  refreshMemory,
  showMemory,
} from './memory.js';
import * as memoryDiscovery from '../utils/memoryDiscovery.js';

vi.mock('../utils/memoryDiscovery.js', () => ({
  refreshServerHierarchicalMemory: vi.fn(),
}));

vi.mock('../config/storage.js', () => ({
  Storage: {
    getUserSkillsDir: vi.fn(),
  },
}));

const mockRefresh = vi.mocked(memoryDiscovery.refreshServerHierarchicalMemory);

describe('memory commands', () => {
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getUserMemory: vi.fn(),
      getGeminiMdFileCount: vi.fn(),
      getGeminiMdFilePaths: vi.fn(),
      isJitContextEnabled: vi.fn(),
      updateSystemInstructionIfInitialized: vi
        .fn()
        .mockResolvedValue(undefined),
    } as unknown as Config;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('showMemory', () => {
    it('should show memory content if it exists', () => {
      vi.mocked(mockConfig.getUserMemory).mockReturnValue(
        'some memory content',
      );
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(1);

      const result = showMemory(mockConfig);

      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toContain(
          'Current memory content from 1 file(s)',
        );
        expect(result.content).toContain('some memory content');
      }
    });

    it('should show a message if memory is empty', () => {
      vi.mocked(mockConfig.getUserMemory).mockReturnValue('');
      vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(0);

      const result = showMemory(mockConfig);

      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toBe('Memory is currently empty.');
      }
    });
  });

  describe('addMemory', () => {
    it('should return a tool action to save memory', () => {
      const result = addMemory('new memory');
      expect(result.type).toBe('tool');
      if (result.type === 'tool') {
        expect(result.toolName).toBe('save_memory');
        expect(result.toolArgs).toEqual({ fact: 'new memory' });
      }
    });

    it('should trim the arguments', () => {
      const result = addMemory('  new memory  ');
      expect(result.type).toBe('tool');
      if (result.type === 'tool') {
        expect(result.toolArgs).toEqual({ fact: 'new memory' });
      }
    });

    it('should return an error if args are empty', () => {
      const result = addMemory('');
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('error');
        expect(result.content).toBe('Usage: /memory add <text to remember>');
      }
    });

    it('should return an error if args are just whitespace', () => {
      const result = addMemory('   ');
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('error');
        expect(result.content).toBe('Usage: /memory add <text to remember>');
      }
    });

    it('should return an error if args are undefined', () => {
      const result = addMemory(undefined);
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('error');
        expect(result.content).toBe('Usage: /memory add <text to remember>');
      }
    });
  });

  describe('refreshMemory', () => {
    it('should refresh memory and show success message', async () => {
      mockRefresh.mockResolvedValue({
        memoryContent: { project: 'refreshed content' },
        fileCount: 2,
        filePaths: [],
      });

      const result = await refreshMemory(mockConfig);

      expect(mockRefresh).toHaveBeenCalledWith(mockConfig);
      expect(
        mockConfig.updateSystemInstructionIfInitialized,
      ).toHaveBeenCalled();
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toBe(
          'Memory reloaded successfully. Loaded 33 characters from 2 file(s)',
        );
      }
    });

    it('should show a message if no memory content is found after refresh', async () => {
      mockRefresh.mockResolvedValue({
        memoryContent: { project: '' },
        fileCount: 0,
        filePaths: [],
      });

      const result = await refreshMemory(mockConfig);
      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toBe(
          'Memory reloaded successfully. No memory content found',
        );
      }
    });
  });

  describe('listMemoryFiles', () => {
    it('should list the memory files in use', () => {
      const filePaths = ['/path/to/GEMINI.md', '/other/path/GEMINI.md'];
      vi.mocked(mockConfig.getGeminiMdFilePaths).mockReturnValue(filePaths);

      const result = listMemoryFiles(mockConfig);

      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toContain(
          'There are 2 GEMINI.md file(s) in use:',
        );
        expect(result.content).toContain(filePaths.join('\n'));
      }
    });

    it('should show a message if no memory files are in use', () => {
      vi.mocked(mockConfig.getGeminiMdFilePaths).mockReturnValue([]);

      const result = listMemoryFiles(mockConfig);

      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toBe('No GEMINI.md files in use.');
      }
    });

    it('should show a message if file paths are undefined', () => {
      vi.mocked(mockConfig.getGeminiMdFilePaths).mockReturnValue(
        undefined as unknown as string[],
      );

      const result = listMemoryFiles(mockConfig);

      expect(result.type).toBe('message');
      if (result.type === 'message') {
        expect(result.messageType).toBe('info');
        expect(result.content).toBe('No GEMINI.md files in use.');
      }
    });
  });

  describe('listInboxSkills', () => {
    let tmpDir: string;
    let skillsDir: string;
    let memoryTempDir: string;
    let inboxConfig: Config;

    async function writeSkillMd(
      dirName: string,
      name: string,
      description: string,
    ): Promise<void> {
      const dir = path.join(skillsDir, dirName);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: ${description}\n---\nBody content here\n`,
      );
    }

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'inbox-test-'));
      skillsDir = path.join(tmpDir, 'skills-memory');
      memoryTempDir = path.join(tmpDir, 'memory-temp');
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.mkdir(memoryTempDir, { recursive: true });

      inboxConfig = {
        storage: {
          getProjectSkillsMemoryDir: () => skillsDir,
          getProjectMemoryTempDir: () => memoryTempDir,
          getProjectSkillsDir: () => path.join(tmpDir, 'project-skills'),
        },
      } as unknown as Config;
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('should return inbox skills with name, description, and extractedAt', async () => {
      await writeSkillMd('my-skill', 'my-skill', 'A test skill');
      await writeSkillMd('other-skill', 'other-skill', 'Another skill');

      const stateContent = JSON.stringify({
        runs: [
          {
            runAt: '2025-01-15T10:00:00Z',
            sessionIds: ['sess-1'],
            skillsCreated: ['my-skill'],
          },
          {
            runAt: '2025-01-16T12:00:00Z',
            sessionIds: ['sess-2'],
            skillsCreated: ['other-skill'],
          },
        ],
      });
      await fs.writeFile(
        path.join(memoryTempDir, '.extraction-state.json'),
        stateContent,
      );

      const skills = await listInboxSkills(inboxConfig);

      expect(skills).toHaveLength(2);
      const mySkill = skills.find((s) => s.dirName === 'my-skill');
      expect(mySkill).toBeDefined();
      expect(mySkill!.name).toBe('my-skill');
      expect(mySkill!.description).toBe('A test skill');
      expect(mySkill!.extractedAt).toBe('2025-01-15T10:00:00Z');

      const otherSkill = skills.find((s) => s.dirName === 'other-skill');
      expect(otherSkill).toBeDefined();
      expect(otherSkill!.name).toBe('other-skill');
      expect(otherSkill!.description).toBe('Another skill');
      expect(otherSkill!.extractedAt).toBe('2025-01-16T12:00:00Z');
    });

    it('should return an empty array when the inbox is empty', async () => {
      const skills = await listInboxSkills(inboxConfig);
      expect(skills).toEqual([]);
    });

    it('should return an empty array when the inbox directory does not exist', async () => {
      const missingConfig = {
        storage: {
          getProjectSkillsMemoryDir: () => path.join(tmpDir, 'nonexistent-dir'),
          getProjectMemoryTempDir: () => memoryTempDir,
        },
      } as unknown as Config;

      const skills = await listInboxSkills(missingConfig);
      expect(skills).toEqual([]);
    });
  });

  describe('moveInboxSkill', () => {
    let tmpDir: string;
    let skillsDir: string;
    let globalSkillsDir: string;
    let projectSkillsDir: string;
    let moveConfig: Config;

    async function writeSkillMd(
      dirName: string,
      name: string,
      description: string,
    ): Promise<void> {
      const dir = path.join(skillsDir, dirName);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: ${description}\n---\nBody content here\n`,
      );
    }

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'move-test-'));
      skillsDir = path.join(tmpDir, 'skills-memory');
      globalSkillsDir = path.join(tmpDir, 'global-skills');
      projectSkillsDir = path.join(tmpDir, 'project-skills');
      await fs.mkdir(skillsDir, { recursive: true });

      moveConfig = {
        storage: {
          getProjectSkillsMemoryDir: () => skillsDir,
          getProjectSkillsDir: () => projectSkillsDir,
        },
      } as unknown as Config;

      vi.mocked(Storage.getUserSkillsDir).mockReturnValue(globalSkillsDir);
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('should move a skill to global skills directory', async () => {
      await writeSkillMd('my-skill', 'my-skill', 'A test skill');

      const result = await moveInboxSkill(moveConfig, 'my-skill', 'global');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Moved "my-skill" to ~/.gemini/skills.');

      // Verify the skill was copied to global
      const targetSkill = await fs.readFile(
        path.join(globalSkillsDir, 'my-skill', 'SKILL.md'),
        'utf-8',
      );
      expect(targetSkill).toContain('name: my-skill');

      // Verify the skill was removed from inbox
      await expect(
        fs.access(path.join(skillsDir, 'my-skill')),
      ).rejects.toThrow();
    });

    it('should move a skill to project skills directory', async () => {
      await writeSkillMd('my-skill', 'my-skill', 'A test skill');

      const result = await moveInboxSkill(moveConfig, 'my-skill', 'project');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Moved "my-skill" to .gemini/skills.');

      // Verify the skill was copied to project
      const targetSkill = await fs.readFile(
        path.join(projectSkillsDir, 'my-skill', 'SKILL.md'),
        'utf-8',
      );
      expect(targetSkill).toContain('name: my-skill');

      // Verify the skill was removed from inbox
      await expect(
        fs.access(path.join(skillsDir, 'my-skill')),
      ).rejects.toThrow();
    });

    it('should return an error when the source skill does not exist', async () => {
      const result = await moveInboxSkill(moveConfig, 'nonexistent', 'global');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Skill "nonexistent" not found in inbox.');
    });

    it('should reject invalid skill directory names', async () => {
      const result = await moveInboxSkill(moveConfig, '../escape', 'global');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid skill name.');
    });

    it('should return an error when the target already exists', async () => {
      await writeSkillMd('my-skill', 'my-skill', 'A test skill');

      // Pre-create the target
      const targetDir = path.join(globalSkillsDir, 'my-skill');
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, 'SKILL.md'), 'existing content');

      const result = await moveInboxSkill(moveConfig, 'my-skill', 'global');

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'A skill named "my-skill" already exists in global skills.',
      );
    });

    it('should detect conflicts based on the normalized skill name', async () => {
      await writeSkillMd(
        'inbox-skill',
        'gke:prs-troubleshooter',
        'A test skill',
      );
      await fs.mkdir(
        path.join(globalSkillsDir, 'existing-gke-prs-troubleshooter'),
        { recursive: true },
      );
      await fs.writeFile(
        path.join(
          globalSkillsDir,
          'existing-gke-prs-troubleshooter',
          'SKILL.md',
        ),
        [
          '---',
          'name: gke-prs-troubleshooter',
          'description: Existing skill',
          '---',
          'Existing body content',
          '',
        ].join('\n'),
      );

      const result = await moveInboxSkill(moveConfig, 'inbox-skill', 'global');

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'A skill named "gke-prs-troubleshooter" already exists in global skills.',
      );
      await expect(
        fs.access(path.join(skillsDir, 'inbox-skill', 'SKILL.md')),
      ).resolves.toBeUndefined();
      await expect(
        fs.access(path.join(globalSkillsDir, 'inbox-skill')),
      ).rejects.toThrow();
    });
  });

  describe('dismissInboxSkill', () => {
    let tmpDir: string;
    let skillsDir: string;
    let dismissConfig: Config;

    async function writeSkillMd(
      dirName: string,
      name: string,
      description: string,
    ): Promise<void> {
      const dir = path.join(skillsDir, dirName);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: ${description}\n---\nBody content here\n`,
      );
    }

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dismiss-test-'));
      skillsDir = path.join(tmpDir, 'skills-memory');
      await fs.mkdir(skillsDir, { recursive: true });

      dismissConfig = {
        storage: {
          getProjectSkillsMemoryDir: () => skillsDir,
        },
      } as unknown as Config;
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('should remove a skill from the inbox', async () => {
      await writeSkillMd('my-skill', 'my-skill', 'A test skill');

      const result = await dismissInboxSkill(dismissConfig, 'my-skill');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Dismissed "my-skill" from inbox.');

      // Verify the skill directory was removed
      await expect(
        fs.access(path.join(skillsDir, 'my-skill')),
      ).rejects.toThrow();
    });

    it('should return an error when the skill does not exist', async () => {
      const result = await dismissInboxSkill(dismissConfig, 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Skill "nonexistent" not found in inbox.');
    });

    it('should reject invalid skill directory names', async () => {
      const result = await dismissInboxSkill(dismissConfig, 'nested\\skill');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid skill name.');
    });
  });
});
