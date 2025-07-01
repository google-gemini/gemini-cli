/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  BaseTool, 
  ToolResult, 
  ToolCallConfirmationDetails
} from './tools.js';
import { Config, ApprovalMode } from '../config/config.js';
import { GeminiClient } from '../core/client.js';
import {
  GitOperations,
  CommitAnalyzer,
  CommitLogger,
  CachedCommitData,
  CommitMode,
  CACHE_MAX_AGE_MS
} from './commit-message/index.js';

export class GenerateCommitMessageTool extends BaseTool<undefined, ToolResult> {
  static readonly Name = 'generate_commit_message';
  
  private readonly client: GeminiClient;
  private readonly config: Config;
  private readonly gitOps: GitOperations;
  private readonly analyzer: CommitAnalyzer;
  private readonly logger: CommitLogger;
  
  private cachedCommitData: CachedCommitData | null = null;

  constructor(config: Config) {
    super(
      GenerateCommitMessageTool.Name,
      'Generate Commit Message',
      'Executes a git commit workflow: analyzes changes, generates commit message, and creates commit.',
      {
        properties: {},
        required: [],
        type: 'object',
      },
    );
    
    this.client = config.getGeminiClient();
    this.config = config;
    this.logger = new CommitLogger(false);
    this.gitOps = new GitOperations(this.logger);
    this.analyzer = new CommitAnalyzer(this.client, this.logger);
  }

  validateToolParams(_params: undefined): string | null {
    return null;
  }

  getDescription(_params: undefined): string {
    return 'Analyze git changes and create commit.';
  }

  async shouldConfirmExecute(
    _params: undefined,
    signal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    try {
      const [statusOutput, stagedDiff, unstagedDiff, logOutput] = await Promise.all([
        this.gitOps.executeGitCommand(['status', '--porcelain'], signal),
        this.gitOps.executeGitCommand(['diff', '--cached'], signal),
        this.gitOps.executeGitCommand(['diff'], signal),
        this.gitOps.executeGitCommand(['log', '--oneline', '-10'], signal)
      ]);
      
      const gitState = this.gitOps.analyzeGitState(statusOutput || '', stagedDiff || '', unstagedDiff || '');
      const commitMode = this.gitOps.determineCommitStrategy(gitState);

      const diffForAI = commitMode === 'staged-only' ? 
        (stagedDiff || '') : 
        [stagedDiff, unstagedDiff].filter(d => d?.trim()).join('\n');

      if (!diffForAI?.trim()) {
        return false;
      }

      const filesToCommit = this.gitOps.parseFilesToBeCommitted(statusOutput || '', commitMode);
      const commitMessage = await this.analyzer.analyzeChangesAndGenerateCommit(
        filesToCommit,
        diffForAI,
        logOutput || '',
        signal
      );
      
      if (!commitMessage?.trim()) {
        throw new Error('The AI failed to generate a valid commit message.');
      }
      
      const indexHash = await this.getReliableIndexHash(commitMode, signal);
      
      this.cachedCommitData = {
        statusOutput: statusOutput || '',
        diffOutput: diffForAI,
        logOutput: logOutput || '',
        commitMessage,
        finalCommitMessage: commitMessage,
        timestamp: Date.now(),
        commitMode,
        indexHash
      };

      const filesDisplay = filesToCommit.length > 0 ? 
        `\nFiles to commit:\n${filesToCommit.map(f => `  - ${f}`).join('\n')}` : 
        '\nNo files to commit';
      
      const strategyDisplay = commitMode === 'staged-only' ? 
        '\nStrategy: Committing staged changes only' : 
        '\nStrategy: Staging and committing all changes';

      return {
        type: 'info',
        title: 'Commit Changes',
        prompt: `${strategyDisplay}${filesDisplay}\n\nProposed commit message:\n${commitMessage}`,
        onConfirm: async () => {}
      };
    } catch (error) {
      this.logger.error('Failed to prepare commit confirmation', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  async execute(_params: undefined, signal: AbortSignal): Promise<ToolResult> {
    try {
      const [statusOutput, stagedDiff, unstagedDiff, logOutput] = await Promise.all([
        this.gitOps.executeGitCommand(['status', '--porcelain'], signal),
        this.gitOps.executeGitCommand(['diff', '--cached'], signal),
        this.gitOps.executeGitCommand(['diff'], signal),
        this.gitOps.executeGitCommand(['log', '--oneline', '-10'], signal)
      ]);
      
      const gitState = this.gitOps.analyzeGitState(statusOutput || '', stagedDiff || '', unstagedDiff || '');
      const commitMode = this.gitOps.determineCommitStrategy(gitState);

      const diffForAI = commitMode === 'staged-only' ? 
        (stagedDiff || '') : 
        [stagedDiff, unstagedDiff].filter(d => d?.trim()).join('\n');

      if (!diffForAI?.trim()) {
        return { 
          llmContent: [{ text: 'No changes detected to commit.' }],
          returnDisplay: 'No changes detected to commit.'
        };
      }

      const filesToCommit = this.gitOps.parseFilesToBeCommitted(statusOutput || '', commitMode);
      const commitMessage = await this.analyzer.analyzeChangesAndGenerateCommit(
        filesToCommit,
        diffForAI,
        logOutput || '',
        signal
      );

      await this.executeCommitStrategy(commitMode, signal);
      await this.gitOps.executeGitCommand(['commit', '-m', commitMessage], signal);
      
      const successMessage = `Successfully committed changes with message:\n${commitMessage}`;
      return { 
        llmContent: [{ text: successMessage }],
        returnDisplay: successMessage
      };
      
    } catch (error) {
      this.logger.error('Failed to execute commit workflow', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  private async executeCommitStrategy(commitMode: CommitMode, signal: AbortSignal): Promise<void> {
    if (commitMode === 'all-changes') {
      this.logger.debug('Staging all changes for commit');
      await this.gitOps.executeGitCommand(['add', '.'], signal);
    }
  }

  private async getReliableIndexHash(commitMode: CommitMode, signal: AbortSignal): Promise<string> {
    try {
      if (commitMode === 'staged-only') {
        return await this.getGitIndexHash(signal);
      }

      this.logger.debug('Temporarily staging files to calculate reliable index hash');
      
      const originalStatus = await this.gitOps.executeGitCommand(['status', '--porcelain'], signal);
      
      await this.gitOps.executeGitCommand(['add', '.'], signal);
      const newIndexHash = await this.getGitIndexHash(signal);
      await this.gitOps.executeGitCommand(['reset', 'HEAD'], signal);
      
      return newIndexHash;
    } catch (error) {
      this.logger.error('Failed to get reliable git index hash', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  private async getGitIndexHash(signal: AbortSignal): Promise<string> {
    try {
      const indexHash = await this.gitOps.executeGitCommand(['write-tree'], signal);
      return indexHash || '';
    } catch (error) {
      this.logger.error('Failed to get git index hash', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw new Error(`Failed to read git index state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}