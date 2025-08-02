/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';

// Mock dependencies
const mockSimpleGit = vi.hoisted(() => vi.fn());
const mockIsGitRepository = vi.hoisted(() => vi.fn());
const mockFindGitRoot = vi.hoisted(() => vi.fn());

vi.mock('simple-git', () => ({
  simpleGit: mockSimpleGit,
}));

vi.mock('../utils/gitUtils.js', () => ({
  isGitRepository: mockIsGitRepository,
  findGitRoot: mockFindGitRoot,
}));

import { GitAssistantTool } from './git-assistant.js';
import { type Config } from '../config/config.js';
import { ToolConfirmationOutcome } from './tools.js';

describe('GitAssistantTool', () => {
  let gitAssistant: GitAssistantTool;
  let mockConfig: Config;
  let mockGit: any;
  let abortSignal: AbortSignal;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock config
    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue('/test/project'),
    } as unknown as Config;

    // Mock git instance
    mockGit = {
      status: vi.fn(),
      diff: vi.fn(),
      log: vi.fn(),
      commit: vi.fn(),
      branch: vi.fn(),
      revparse: vi.fn(),
    };

    mockSimpleGit.mockReturnValue(mockGit);
    mockIsGitRepository.mockReturnValue(true);
    mockFindGitRoot.mockReturnValue('/test/project');

    gitAssistant = new GitAssistantTool(mockConfig);
    abortSignal = new AbortController().signal;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('validateToolParams', () => {
    it('should pass validation for valid smart_commit action', () => {
      const params = { action: 'smart_commit' as const };
      const result = gitAssistant.validateToolParams(params);
      expect(result).toBeNull();
    });

    it('should pass validation for valid git_status action', () => {
      const params = { action: 'git_status' as const };
      const result = gitAssistant.validateToolParams(params);
      expect(result).toBeNull();
    });

    it('should fail validation when not in git repository', () => {
      mockIsGitRepository.mockReturnValue(false);
      const params = { action: 'smart_commit' as const };
      const result = gitAssistant.validateToolParams(params);
      expect(result).toContain('not a git repository');
    });

    it('should require branch_name for create_pr action', () => {
      const params = { action: 'create_pr' as const };
      const result = gitAssistant.validateToolParams(params);
      expect(result).toContain('Branch name is required');
    });

    it('should validate commit_count range for commit_history action', () => {
      const params = { action: 'commit_history' as const, commit_count: 100 };
      const result = gitAssistant.validateToolParams(params);
      expect(result).toContain('must be <= 50');
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should require confirmation for smart_commit', async () => {
      const params = { action: 'smart_commit' as const };
      const result = await gitAssistant.shouldConfirmExecute(params, abortSignal);
      expect(result).toBeTruthy();
      expect((result as any).type).toBe('exec');
      expect((result as any).title).toBe('Confirm Git Commit');
    });

    it('should require confirmation for create_pr', async () => {
      const params = { action: 'create_pr' as const, branch_name: 'feature' };
      const result = await gitAssistant.shouldConfirmExecute(params, abortSignal);
      expect(result).toBeTruthy();
      expect((result as any).type).toBe('exec');
      expect((result as any).title).toBe('Confirm Git PR Creation');
    });

    it('should not require confirmation for read-only operations', async () => {
      const params = { action: 'git_status' as const };
      const result = await gitAssistant.shouldConfirmExecute(params, abortSignal);
      expect(result).toBe(false);
    });
  });

  describe('execute - smart_commit', () => {
    it('should successfully create commit with staged changes', async () => {
      const mockStatus = {
        staged: ['file1.js', 'file2.ts'],
        current: 'feature-branch',
      };
      const mockDiff = '+console.log("test");';
      const mockCommitResult = { commit: 'abc123' };

      mockGit.status.mockResolvedValue(mockStatus);
      mockGit.diff.mockResolvedValue(mockDiff);
      mockGit.commit.mockResolvedValue(mockCommitResult);

      const params = { action: 'smart_commit' as const };
      const result = await gitAssistant.execute(params, abortSignal);

      expect(result.llmContent).toContain('Smart Commit Created');
      expect(result.llmContent).toContain('abc123');
      expect(result.llmContent).toContain('file1.js');
      expect(result.returnDisplay).toContain('Commit created: abc123');
    });

    it('should handle no staged changes', async () => {
      const mockStatus = { staged: [], current: 'main' };
      mockGit.status.mockResolvedValue(mockStatus);

      const params = { action: 'smart_commit' as const };
      const result = await gitAssistant.execute(params, abortSignal);

      expect(result.llmContent).toContain('No staged changes found');
      expect(result.returnDisplay).toContain('No staged changes to commit');
    });

    it('should use custom commit message when provided', async () => {
      const mockStatus = { staged: ['file1.js'], current: 'main' };
      const mockDiff = '+test code';
      const mockCommitResult = { commit: 'def456' };
      const customMessage = 'Custom commit message';

      mockGit.status.mockResolvedValue(mockStatus);
      mockGit.diff.mockResolvedValue(mockDiff);
      mockGit.commit.mockResolvedValue(mockCommitResult);

      const params = { action: 'smart_commit' as const, message: customMessage };
      const result = await gitAssistant.execute(params, abortSignal);

      expect(mockGit.commit).toHaveBeenCalledWith(customMessage);
      expect(result.llmContent).toContain(customMessage);
    });
  });

  describe('execute - git_status', () => {
    it('should return enhanced git status', async () => {
      const mockStatus = {
        current: 'feature-branch',
        staged: ['file1.js'],
        modified: ['file2.js'],
        not_added: ['file3.js'],
        deleted: [],
        ahead: 2,
        behind: 1,
      };
      mockGit.status.mockResolvedValue(mockStatus);

      const params = { action: 'git_status' as const };
      const result = await gitAssistant.execute(params, abortSignal);

      expect(result.llmContent).toContain('Enhanced Git Status');
      expect(result.returnDisplay).toContain('Git status:');
    });
  });

  describe('execute - analyze_changes', () => {
    it('should analyze repository changes', async () => {
      const mockStatus = {
        staged: ['file1.js'],
        modified: ['file2.js'],
        not_added: ['file3.js'],
        deleted: [],
      };
      const mockDiff = '+new code\n-old code';
      const mockStagedDiff = '+staged code';

      mockGit.status.mockResolvedValue(mockStatus);
      mockGit.diff.mockResolvedValueOnce(mockDiff);
      mockGit.diff.mockResolvedValueOnce(mockStagedDiff);

      const params = { action: 'analyze_changes' as const };
      const result = await gitAssistant.execute(params, abortSignal);

      expect(result.llmContent).toContain('Repository Change Analysis');
      expect(result.llmContent).toContain('**Staged files:** 1');
      expect(result.llmContent).toContain('**Modified files:** 1');
      expect(result.llmContent).toContain('Lines added:');
      expect(result.llmContent).toContain('Lines removed:');
    });
  });

  describe('execute - commit_history', () => {
    it('should analyze commit history patterns', async () => {
      const mockLog = {
        all: [
          {
            message: 'feat: add new feature',
            author_name: 'John Doe',
            date: '2025-01-01',
            hash: 'abc123456',
          },
          {
            message: 'fix: resolve bug',
            author_name: 'Jane Smith',
            date: '2025-01-02',
            hash: 'def789012',
          },
        ],
      };
      mockGit.log.mockResolvedValue(mockLog);

      const params = { action: 'commit_history' as const, commit_count: 2 };
      const result = await gitAssistant.execute(params, abortSignal);

      expect(result.llmContent).toContain('Commit History Analysis');
      expect(result.returnDisplay).toContain('Analyzed 2 recent commits');
    });
  });

  describe('execute - create_pr', () => {
    it('should generate PR description from commits and diff', async () => {
      const mockCurrentBranch = 'feature-branch';
      const mockDiff = '+new feature code\n-old code';
      const mockCommits = {
        total: 2,
        all: [
          {
            message: 'feat: implement feature',
            hash: 'abc123',
          },
          {
            message: 'fix: resolve issue',
            hash: 'def456',
          },
        ],
      };

      mockGit.revparse.mockResolvedValue(mockCurrentBranch);
      mockGit.diff.mockResolvedValue(mockDiff);
      mockGit.log.mockResolvedValue(mockCommits);

      const params = {
        action: 'create_pr' as const,
        branch_name: 'feature-branch',
        pr_title: 'Add awesome feature',
      };
      const result = await gitAssistant.execute(params, abortSignal);

      expect(result.llmContent).toContain('Pull Request Ready');
      expect(result.llmContent).toContain('gh pr create');
      expect(result.returnDisplay).toContain('PR description generated');
    });
  });

  describe('error handling', () => {
    it('should handle git repository not found', async () => {
      mockIsGitRepository.mockReturnValue(false);
      const params = { action: 'git_status' as const };
      const result = await gitAssistant.execute(params, abortSignal);

      expect(result.llmContent).toContain('not a git repository');
      expect(result.returnDisplay).toContain('not a git repository');
    });

    it('should handle git command failures gracefully', async () => {
      mockGit.status.mockRejectedValue(new Error('Git command failed'));
      const params = { action: 'git_status' as const };
      const result = await gitAssistant.execute(params, abortSignal);

      expect(result.llmContent).toContain('Git operation failed');
      expect(result.returnDisplay).toContain('Git command failed');
    });

    it('should handle aborted operations', async () => {
      const abortController = new AbortController();
      abortController.abort();
      const abortedSignal = abortController.signal;

      const params = { action: 'git_status' as const };
      const result = await gitAssistant.execute(params, abortedSignal);

      expect(result.llmContent).toContain('cancelled by user');
      expect(result.returnDisplay).toContain('cancelled by user');
    });
  });

  describe('commit message generation', () => {
    it('should generate commit messages based on staged files', async () => {
      mockGit.status.mockResolvedValue({ staged: ['test.spec.js'] });
      mockGit.diff.mockResolvedValue('+test code');
      mockGit.commit.mockResolvedValue({ commit: 'test123' });

      const params = { action: 'smart_commit' as const };
      const result = await gitAssistant.execute(params, abortSignal);

      expect(mockGit.commit).toHaveBeenCalled();
      expect(result.llmContent).toContain('Smart Commit Created');
    });
  });
});