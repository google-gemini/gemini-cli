/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Config } from '../config/config.js';
import { spawnAsync } from '../utils/shell-utils.js';
import { debugLogger } from '../utils/debugLogger.js';

export interface EpicContext {
  epicId: string;
  path: string;
  branchName?: string;
  issueId?: string;
}

export class AklDiscoveryService {
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Discovers the active Epic context for the current session.
   */
  async discoverActiveEpic(): Promise<EpicContext | null> {
    if (!this.config.getAklEnabled()) {
      return null;
    }

    const gitService = await this.config.getGitService();
    const branchName = await gitService.getCurrentBranch();
    const repoRoot = gitService.getRepoRoot();

    // 1. Try to find issue ID from GitHub
    const issueId = await this.detectGitHubIssue(branchName);

    // 2. Search for existing epic folder
    const epicId = issueId || branchName;
    if (!epicId || epicId === 'HEAD') {
      return null;
    }

    const epicPath = path.join(repoRoot, '.gemini', 'epics', epicId);

    try {
      await fs.access(epicPath);
      return { epicId, path: epicPath, branchName, issueId };
    } catch {
      // Epic folder doesn't exist yet
      debugLogger.debug(`Epic folder not found at ${epicPath}`);
      return { epicId, path: epicPath, branchName, issueId };
    }
  }

  private async detectGitHubIssue(
    branchName: string,
  ): Promise<string | undefined> {
    try {
      // Use 'gh pr view' to find linked issue if it's a PR branch
      const { stdout } = await spawnAsync('gh', [
        'pr',
        'view',
        '--json',
        'number,title,body',
      ]);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const prData = JSON.parse(stdout) as { body: string; title: string };

      // Often issues are linked in the PR body or title
      const issueMatch =
        prData.body.match(/#(\d+)/) || prData.title.match(/#(\d+)/);
      if (issueMatch) {
        return issueMatch[1];
      }
    } catch (error) {
      debugLogger.debug(
        `Failed to detect GitHub issue via gh: ${String(error)}`,
      );
    }

    // Fallback: look for issue ID in branch name (e.g., 'fix/123-bug' or '123-feature')
    const branchIssueMatch = branchName.match(/(?:^|[/-])(\d+)(?:-|$)/);
    return branchIssueMatch ? branchIssueMatch[1] : undefined;
  }

  /**
   * Fetches full context for a GitHub issue and its parents.
   */
  async syncGitHubContext(issueId: string): Promise<string> {
    try {
      // Use 'gh issue view' to find parent/original issue
      const { stdout } = await spawnAsync('gh', [
        'issue',
        'view',
        issueId,
        '--json',
        'title,body,comments',
      ]);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const issueData = JSON.parse(stdout) as {
        title: string;
        body: string;
        comments: Array<{ author: { login: string }; body: string }>;
      };

      let context = `## GitHub Issue #${issueId}: ${issueData.title}\n\n${issueData.body}\n`;

      if (issueData.comments?.length > 0) {
        context += `\n### Relevant Comments\n`;
        for (const comment of issueData.comments) {
          context += `\n- **${comment.author.login}**: ${comment.body.substring(0, 500)}${comment.body.length > 500 ? '...' : ''}\n`;
        }
      }

      return context;
    } catch (error) {
      debugLogger.debug(
        `Failed to sync GitHub context for issue ${issueId}: ${String(error)}`,
      );
      return '';
    }
  }
}
