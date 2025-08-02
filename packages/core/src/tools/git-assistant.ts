/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { simpleGit, SimpleGit } from 'simple-git';
import { Config } from '../config/config.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolConfirmationOutcome,
  Icon,
} from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { isGitRepository, findGitRoot } from '../utils/gitUtils.js';
import { getErrorMessage } from '../utils/errors.js';

export interface GitAssistantParams {
  action: 'smart_commit' | 'analyze_changes' | 'create_pr' | 'git_status' | 'commit_history';
  message?: string;
  files?: string[];
  branch_name?: string;
  pr_title?: string;
  pr_description?: string;
  commit_count?: number;
}

export class GitAssistantTool extends BaseTool<GitAssistantParams, ToolResult> {
  static Name: string = 'git_assistant';
  private git: SimpleGit;
  private gitRoot: string | null = null;

  constructor(private readonly config: Config) {
    super(
      GitAssistantTool.Name,
      'Git Assistant',
      `Intelligent Git workflow assistant that helps with commit message generation, change analysis, and repository management.

      Actions available:
      - smart_commit: Generate intelligent commit messages based on staged changes
      - analyze_changes: Analyze current changes and provide insights
      - create_pr: Create pull request with generated description
      - git_status: Enhanced git status with recommendations
      - commit_history: Analyze recent commit history patterns

      This tool respects git ignore patterns and provides safety confirmations for destructive operations.`,
      Icon.Terminal,
      {
        type: Type.OBJECT,
        properties: {
          action: {
            type: Type.STRING,
            description: 'The git operation to perform',
            enum: ['smart_commit', 'analyze_changes', 'create_pr', 'git_status', 'commit_history'],
          },
          message: {
            type: Type.STRING,
            description: 'Optional custom commit message or additional context',
          },
          files: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Optional specific files to operate on',
          },
          branch_name: {
            type: Type.STRING,
            description: 'Branch name for PR creation',
          },
          pr_title: {
            type: Type.STRING,
            description: 'Custom PR title',
          },
          pr_description: {
            type: Type.STRING,
            description: 'Custom PR description',
          },
          commit_count: {
            type: Type.NUMBER,
            description: 'Number of recent commits to analyze (default: 10)',
            minimum: 1,
            maximum: 50,
          },
        },
        required: ['action'],
      },
      true, // output is markdown
      false, // output cannot be updated
    );

    this.git = simpleGit(this.config.getTargetDir());
  }

  getDescription(params: GitAssistantParams): string {
    switch (params.action) {
      case 'smart_commit':
        return 'Generate intelligent commit message and create commit';
      case 'analyze_changes':
        return 'Analyze current repository changes';
      case 'create_pr':
        return `Create pull request${params.pr_title ? `: ${params.pr_title}` : ''}`;
      case 'git_status':
        return 'Show enhanced git status with recommendations';
      case 'commit_history':
        return `Analyze recent commit history (${params.commit_count || 10} commits)`;
      default:
        return `Git assistant: ${params.action}`;
    }
  }

  validateToolParams(params: GitAssistantParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    // Check if we're in a git repository
    if (!isGitRepository(this.config.getTargetDir())) {
      return 'This directory is not a git repository. Initialize a git repository first with `git init`.';
    }

    // Validate action-specific parameters
    switch (params.action) {
      case 'create_pr':
        if (!params.branch_name) {
          return 'Branch name is required for PR creation';
        }
        break;
      case 'commit_history':
        if (params.commit_count && (params.commit_count < 1 || params.commit_count > 50)) {
          return 'Commit count must be between 1 and 50';
        }
        break;
    }

    return null;
  }

  async shouldConfirmExecute(
    params: GitAssistantParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.validateToolParams(params)) {
      return false; // skip confirmation, execute call will fail immediately
    }

    // Only confirm for potentially destructive operations
    if (params.action === 'smart_commit' || params.action === 'create_pr') {
      const confirmationDetails: ToolExecuteConfirmationDetails = {
        type: 'exec',
        title: `Confirm Git ${params.action === 'smart_commit' ? 'Commit' : 'PR Creation'}`,
        command: this.getDescription(params),
        rootCommand: params.action,
        onConfirm: async (_outcome: ToolConfirmationOutcome) => {
          // No persistent allowlist needed for git operations
        },
      };
      return confirmationDetails;
    }

    return false; // no confirmation needed for read-only operations
  }

  async execute(
    params: GitAssistantParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: validationError,
        returnDisplay: validationError,
      };
    }

    if (signal.aborted) {
      return {
        llmContent: 'Git operation was cancelled by user.',
        returnDisplay: 'Operation cancelled by user.',
      };
    }

    try {
      // Initialize git root for operations
      this.gitRoot = findGitRoot(this.config.getTargetDir());
      if (!this.gitRoot) {
        throw new Error('Could not find git repository root');
      }

      this.git = simpleGit(this.gitRoot);

      switch (params.action) {
        case 'smart_commit':
          return await this.handleSmartCommit(params, signal);
        case 'analyze_changes':
          return await this.handleAnalyzeChanges(params, signal);
        case 'create_pr':
          return await this.handleCreatePR(params, signal);
        case 'git_status':
          return await this.handleGitStatus(params, signal);
        case 'commit_history':
          return await this.handleCommitHistory(params, signal);
        default:
          throw new Error(`Unsupported action: ${params.action}`);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Git operation failed: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  private async handleSmartCommit(
    params: GitAssistantParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    if (signal.aborted) throw new Error('Operation cancelled');

    // Get staged changes
    const status = await this.git.status();
    const stagedFiles = status.staged;

    if (stagedFiles.length === 0) {
      return {
        llmContent: 'No staged changes found. Use `git add` to stage files before committing.',
        returnDisplay: 'No staged changes to commit.',
      };
    }

    // Get diff of staged changes
    const diff = await this.git.diff(['--cached']);
    
    // Generate intelligent commit message
    const commitMessage = await this.generateCommitMessage(diff, stagedFiles, params.message);

    // Create the commit
    const commitResult = await this.git.commit(commitMessage);

    const result = `## Smart Commit Created

**Commit Hash:** \`${commitResult.commit}\`
**Files Changed:** ${stagedFiles.length}
**Message:** ${commitMessage}

### Files Included:
${stagedFiles.map(file => `- ${file}`).join('\n')}

### Generated Commit Message:
\`\`\`
${commitMessage}
\`\`\``;

    return {
      llmContent: result,
      returnDisplay: `Commit created: ${commitResult.commit.substring(0, 8)} - ${commitMessage}`,
    };
  }

  private async handleAnalyzeChanges(
    params: GitAssistantParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    if (signal.aborted) throw new Error('Operation cancelled');

    const status = await this.git.status();
    const diff = await this.git.diff();
    const stagedDiff = await this.git.diff(['--cached']);

    const analysis = this.analyzeRepositoryChanges(status, diff, stagedDiff);

    return {
      llmContent: analysis,
      returnDisplay: 'Repository changes analyzed',
    };
  }

  private async handleCreatePR(
    params: GitAssistantParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    if (signal.aborted) throw new Error('Operation cancelled');

    const currentBranch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    const baseBranch = 'main'; // Could be configurable

    // Get diff between branches
    const diff = await this.git.diff([`${baseBranch}...${currentBranch}`]);
    const commits = await this.git.log([`${baseBranch}..${currentBranch}`]);

    const prDescription = await this.generatePRDescription(
      diff,
      commits.all,
      params.pr_description,
    );

    const prInfo = `## Pull Request Ready

**Branch:** \`${currentBranch}\` → \`${baseBranch}\`
**Title:** ${params.pr_title || `feat: ${currentBranch}`}
**Commits:** ${commits.total}

### Generated Description:
${prDescription}

### Commands to create PR:
\`\`\`bash
# Using GitHub CLI
gh pr create --title "${params.pr_title || `feat: ${currentBranch}`}" --body "${prDescription.replace(/"/g, '\\"')}"

# Or push and create via web interface
git push origin ${currentBranch}
\`\`\``;

    return {
      llmContent: prInfo,
      returnDisplay: `PR description generated for ${currentBranch}`,
    };
  }

  private async handleGitStatus(
    params: GitAssistantParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    if (signal.aborted) throw new Error('Operation cancelled');

    const status = await this.git.status();
    const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    
    let recommendations: string[] = [];

    // Generate recommendations based on status
    if (status.not_added.length > 0) {
      recommendations.push('📁 You have untracked files. Consider adding them with `git add .` or adding to `.gitignore`');
    }
    
    if (status.modified.length > 0) {
      recommendations.push('✏️ You have modified files. Stage them with `git add` when ready to commit');
    }
    
    if (status.staged.length > 0) {
      recommendations.push('✅ You have staged changes ready to commit. Use the smart_commit action to generate an intelligent commit message');
    }

    if (status.ahead > 0) {
      recommendations.push(`🚀 Your branch is ${status.ahead} commits ahead. Consider pushing: \`git push origin ${branch}\``);
    }

    if (status.behind > 0) {
      recommendations.push(`⬇️ Your branch is ${status.behind} commits behind. Consider pulling: \`git pull origin ${branch}\``);
    }

    const statusReport = `## Enhanced Git Status

**Current Branch:** \`${branch}\`
**Status:** ${status.ahead > 0 ? `${status.ahead} ahead` : ''}${status.behind > 0 ? `, ${status.behind} behind` : ''}

### Files Status:
- **Staged:** ${status.staged.length} files
- **Modified:** ${status.modified.length} files  
- **Untracked:** ${status.not_added.length} files
- **Deleted:** ${status.deleted.length} files

${status.staged.length > 0 ? `\n### Staged Files:\n${status.staged.map(f => `- ${f}`).join('\n')}` : ''}
${status.modified.length > 0 ? `\n### Modified Files:\n${status.modified.map(f => `- ${f}`).join('\n')}` : ''}
${status.not_added.length > 0 ? `\n### Untracked Files:\n${status.not_added.map(f => `- ${f}`).join('\n')}` : ''}

${recommendations.length > 0 ? `\n### Recommendations:\n${recommendations.map(r => `${r}`).join('\n')}` : ''}`;

    return {
      llmContent: statusReport,
      returnDisplay: `Git status: ${status.staged.length} staged, ${status.modified.length} modified, ${status.not_added.length} untracked`,
    };
  }

  private async handleCommitHistory(
    params: GitAssistantParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    if (signal.aborted) throw new Error('Operation cancelled');

    const commitCount = params.commit_count || 10;
    const log = await this.git.log({ maxCount: commitCount });

    const analysis = this.analyzeCommitHistory(log.all);

    return {
      llmContent: analysis,
      returnDisplay: `Analyzed ${log.all.length} recent commits`,
    };
  }

  private async generateCommitMessage(
    diff: string,
    stagedFiles: string[],
    customMessage?: string,
  ): Promise<string> {
    if (customMessage) {
      return customMessage;
    }

    // Simple heuristic-based commit message generation
    // In a real implementation, this could use the Gemini API for more intelligent generation
    
    const fileExtensions = stagedFiles.map(f => path.extname(f)).filter(Boolean);
    const uniqueExtensions = [...new Set(fileExtensions)];
    
    let commitType = 'feat';
    let scope = '';
    let description = '';

    // Determine commit type based on file patterns and diff content
    if (diff.includes('package.json') || diff.includes('package-lock.json')) {
      commitType = 'deps';
      description = 'update dependencies';
    } else if (diff.includes('test') || diff.includes('spec')) {
      commitType = 'test';
      description = 'add/update tests';
    } else if (diff.includes('README') || diff.includes('.md')) {
      commitType = 'docs';
      description = 'update documentation';
    } else if (diff.includes('fix') || diff.includes('bug')) {
      commitType = 'fix';
      description = 'resolve issues';
    } else if (stagedFiles.some(f => f.includes('config') || f.includes('.json'))) {
      commitType = 'config';
      description = 'update configuration';
    } else {
      commitType = 'feat';
      description = 'implement new functionality';
    }

    // Determine scope from directory structure
    const directories = stagedFiles.map(f => path.dirname(f)).filter(d => d !== '.');
    const commonDir = directories.length > 0 ? directories[0].split('/')[0] : '';
    if (commonDir && commonDir !== '.') {
      scope = `(${commonDir})`;
    }

    // Generate description based on files and changes
    if (stagedFiles.length === 1) {
      const fileName = path.basename(stagedFiles[0], path.extname(stagedFiles[0]));
      description = `update ${fileName}`;
    } else if (uniqueExtensions.length === 1) {
      description = `update ${uniqueExtensions[0]} files`;
    } else {
      description = `update ${stagedFiles.length} files`;
    }

    return `${commitType}${scope}: ${description}`;
  }

  private generatePRDescription(
    diff: string,
    commits: readonly any[],
    customDescription?: string,
  ): string {
    if (customDescription) {
      return customDescription;
    }

    let description = '## Summary\n\n';
    
    if (commits.length === 1) {
      description += `This PR contains a single commit: ${commits[0].message}\n\n`;
    } else {
      description += `This PR contains ${commits.length} commits:\n\n`;
      commits.forEach((commit, index) => {
        description += `${index + 1}. ${commit.message} (${commit.hash.substring(0, 8)})\n`;
      });
      description += '\n';
    }

    description += '## Changes\n\n';
    description += 'This PR introduces the following changes:\n\n';
    
    // Analyze diff for patterns
    const lines = diff.split('\n');
    const addedLines = lines.filter(line => line.startsWith('+')).length;
    const removedLines = lines.filter(line => line.startsWith('-')).length;
    
    description += `- ${addedLines} lines added\n`;
    description += `- ${removedLines} lines removed\n\n`;
    
    description += '## Testing\n\n';
    description += '- [ ] Tests added/updated\n';
    description += '- [ ] Manual testing completed\n';
    description += '- [ ] Documentation updated\n\n';

    return description;
  }

  private analyzeRepositoryChanges(status: any, diff: string, stagedDiff: string): string {
    let analysis = '## Repository Change Analysis\n\n';

    analysis += '### Current Status\n';
    analysis += `- **Staged files:** ${status.staged.length}\n`;
    analysis += `- **Modified files:** ${status.modified.length}\n`;
    analysis += `- **Untracked files:** ${status.not_added.length}\n`;
    analysis += `- **Deleted files:** ${status.deleted.length}\n\n`;

    if (diff || stagedDiff) {
      const totalDiff = diff + stagedDiff;
      const addedLines = totalDiff.split('\n').filter(line => line.startsWith('+')).length;
      const removedLines = totalDiff.split('\n').filter(line => line.startsWith('-')).length;
      
      analysis += '### Change Summary\n';
      analysis += `- **Lines added:** ${addedLines}\n`;
      analysis += `- **Lines removed:** ${removedLines}\n`;
      analysis += `- **Net change:** ${addedLines - removedLines} lines\n\n`;
    }

    analysis += '### Recommendations\n';
    if (status.staged.length > 0) {
      analysis += '- ✅ Ready to commit staged changes\n';
    }
    if (status.modified.length > 0) {
      analysis += '- 📝 Review and stage modified files when ready\n';
    }
    if (status.not_added.length > 0) {
      analysis += '- 📁 Consider adding untracked files or updating .gitignore\n';
    }

    return analysis;
  }

  private analyzeCommitHistory(commits: readonly any[]): string {
    let analysis = `## Commit History Analysis\n\n`;
    analysis += `**Recent commits:** ${commits.length}\n\n`;

    // Analyze commit patterns
    const commitTypes = new Map<string, number>();
    const authors = new Map<string, number>();
    
    commits.forEach(commit => {
      const message = commit.message;
      const match = message.match(/^(\w+)(\(.+\))?:/);
      const type = match ? match[1] : 'other';
      
      commitTypes.set(type, (commitTypes.get(type) || 0) + 1);
      authors.set(commit.author_name, (authors.get(commit.author_name) || 0) + 1);
    });

    analysis += '### Commit Types\n';
    Array.from(commitTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        analysis += `- **${type}:** ${count} commits\n`;
      });

    analysis += '\n### Contributors\n';
    Array.from(authors.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([author, count]) => {
        analysis += `- **${author}:** ${count} commits\n`;
      });

    analysis += '\n### Recent Commits\n';
    commits.slice(0, 5).forEach((commit, index) => {
      const date = new Date(commit.date).toLocaleDateString();
      analysis += `${index + 1}. **${commit.message}** - ${commit.author_name} (${date})\n`;
    });

    return analysis;
  }
}