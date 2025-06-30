/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  BaseTool, 
  ToolResult, 
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolConfirmationOutcome 
} from './tools.js';
import { Config, ApprovalMode } from '../config/config.js';
import { GeminiClient } from '../core/client.js';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';

const execAsync = promisify(exec);

const COMMIT_ANALYSIS_PROMPT = `You are an expert software engineer specializing in writing concise and meaningful git commit messages following the Conventional Commits format.

Your task is to analyze git changes and generate commit messages that follow this specific workflow:

# Analysis Process
1. List the files that have been changed or added
2. Summarize the nature of the changes (new feature, enhancement, bug fix, refactoring, test, docs, etc.)
3. Determine the purpose or motivation behind these changes
4. Assess the impact of these changes on the overall project
5. Check for any sensitive information that shouldn't be committed
6. Draft a concise commit message that focuses on the "why" rather than the "what"

# Commit Message Format
- **Header**: \`type(scope): subject\` (lowercase)
- **Types**: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
- **Body**: Optional. Explain the "what" and "why" using imperative, present tense
- **Footer**: Optional. For BREAKING CHANGES and issue references

# Requirements
- Message must be clear, concise, and to the point
- Must accurately reflect the changes and their purpose
- Avoid generic words like "Update" or "Fix" without context
- Focus on the motivation and impact, not just the implementation details

# Output Format
Please provide your analysis in <commit_analysis> tags, then provide the final commit message.

# Git Status
\`\`\`
{{status}}
\`\`\`

# Git Diff
\`\`\`diff
{{diff}}
\`\`\`

# Recent Commit Messages (for reference)
\`\`\`
{{log}}
\`\`\``;

export class GenerateCommitMessageTool extends BaseTool<undefined, ToolResult> {
  static readonly Name = 'generate_commit_message';
  private readonly client: GeminiClient;
  private readonly config: Config;
  
  // Cache generated commit message to avoid regeneration
  private cachedCommitData: {
    statusOutput: string;
    diffOutput: string;
    logOutput: string;
    commitMessage: string;
    finalCommitMessage: string;
    timestamp: number;
  } | null = null;

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
    // Check if auto-commit is enabled
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    try {
      // First gather git information
      const [statusOutput, diffOutput, logOutput] = await Promise.all([
        this.executeGitCommand(['status', '--porcelain'], signal),
        this.executeGitCommand(['diff', '--cached'], signal).then(staged => 
          staged || this.executeGitCommand(['diff'], signal)
        ),
        this.executeGitCommand(['log', '--oneline', '-10'], signal)
      ]);

      if (!diffOutput?.trim()) {
        // No changes to confirm
        return false;
      }

      // Generate commit message first and cache it
      const commitMessage = await this.generateCommitMessage(
        statusOutput || '',
        diffOutput,
        logOutput || '',
        signal
      );

      const finalCommitMessage = this.addGeminiSignature(commitMessage);
      
      // Cache the data for execute method
      this.cachedCommitData = {
        statusOutput: statusOutput || '',
        diffOutput,
        logOutput: logOutput || '',
        commitMessage,
        finalCommitMessage,
        timestamp: Date.now()
      };

      const confirmationDetails: ToolExecuteConfirmationDetails = {
        type: 'exec',
        title: 'Confirm Git Commit',
        command: `Commit with message:\n\n${finalCommitMessage}`,
        rootCommand: 'git-commit',
        onConfirm: async (outcome: ToolConfirmationOutcome) => {
          if (outcome === ToolConfirmationOutcome.ProceedAlways) {
            this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
          }
        },
      };
      return confirmationDetails;
    } catch (error) {
      // If we can't gather git info or generate message, skip confirmation
      return false;
    }
  }

  async execute(_params: undefined, signal: AbortSignal): Promise<ToolResult> {
    console.debug('[GenerateCommitMessage] Starting git commit workflow...');

    try {
      let finalCommitMessage: string;
      let statusOutput: string;

      // Check if we have cached data from shouldConfirmExecute
      if (this.cachedCommitData && (Date.now() - this.cachedCommitData.timestamp < 30000)) {
        console.debug('[GenerateCommitMessage] Using cached commit message from confirmation...');
        finalCommitMessage = this.cachedCommitData.finalCommitMessage;
        statusOutput = this.cachedCommitData.statusOutput;
        
        // Clear cache after use
        this.cachedCommitData = null;
      } else {
        console.debug('[GenerateCommitMessage] No valid cache, generating fresh commit message...');
        
        // Step 1: Gather git information (parallel execution)
        const [statusOut, diffOutput, logOutput] = await Promise.all([
          this.executeGitCommand(['status', '--porcelain'], signal),
          this.executeGitCommand(['diff', '--cached'], signal).then(staged => 
            staged || this.executeGitCommand(['diff'], signal)
          ),
          this.executeGitCommand(['log', '--oneline', '-10'], signal)
        ]);

        statusOutput = statusOut || '';

        if (!diffOutput?.trim()) {
          return {
            llmContent: 'No changes detected in the current workspace.',
            returnDisplay: 'No changes detected in the current workspace.',
          };
        }

        // Step 2: Generate commit message using AI analysis
        const commitMessage = await this.generateCommitMessage(
          statusOutput,
          diffOutput,
          logOutput || '',
          signal
        );

        finalCommitMessage = this.addGeminiSignature(commitMessage);
      }

      // Step 3: Add relevant files to staging area if needed
      if (statusOutput?.includes('??')) {
        console.debug('[GenerateCommitMessage] Adding untracked files to staging...');
        const untrackedFiles = this.parseUntrackedFiles(statusOutput);
        if (untrackedFiles.length > 0) {
          await this.executeGitCommand(['add', ...untrackedFiles], signal);
        }
      }

      // Step 4: Create commit
      console.debug('[GenerateCommitMessage] Creating commit with message:', finalCommitMessage.substring(0, 100) + '...');
      
      try {
        await this.executeGitCommand(['commit', '-m', finalCommitMessage], signal);
        
        // Step 5: Verify commit was successful
        const finalStatus = await this.executeGitCommand(['status', '--porcelain'], signal);
        
        return {
          llmContent: `Commit created successfully!\n\nCommit message:\n${finalCommitMessage}`,
          returnDisplay: `Commit created successfully!\n\nCommit message:\n${finalCommitMessage}`,
        };
      } catch (commitError) {
        // Handle pre-commit hook modifications
        if (commitError instanceof Error && commitError.message.includes('pre-commit')) {
          console.debug('[GenerateCommitMessage] Pre-commit hook modified files, retrying...');
          await this.executeGitCommand(['add', '.'], signal);
          await this.executeGitCommand(['commit', '-m', finalCommitMessage], signal);
          
          return {
            llmContent: `Commit created successfully after pre-commit hook modifications!\n\nCommit message:\n${finalCommitMessage}`,
            returnDisplay: `Commit created successfully after pre-commit hook modifications!\n\nCommit message:\n${finalCommitMessage}`,
          };
        }
        throw commitError;
      }

    } catch (error) {
      console.error('[GenerateCommitMessage] Error during execution:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error during commit workflow: ${errorMessage}`,
        returnDisplay: `Error during commit workflow: ${errorMessage}`,
      };
    }
  }

  private async executeGitCommand(
    args: string[],
    signal: AbortSignal,
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { signal, stdio: 'pipe' });
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode) => {
        if (exitCode !== 0) {
          reject(new Error(`Git command failed (${args.join(' ')}): ${stderr}`));
        } else {
          resolve(stdout.trim() || null);
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to execute git ${args.join(' ')}: ${err.message}`));
      });
    });
  }

  private parseUntrackedFiles(statusOutput: string): string[] {
    return statusOutput
      .split('\n')
      .filter(line => line.startsWith('??'))
      .map(line => line.substring(3).trim())
      .filter(file => !file.includes('node_modules/') && !file.includes('.git/'));
  }

  private async generateCommitMessage(
    status: string,
    diff: string,
    log: string,
    signal: AbortSignal,
  ): Promise<string> {
    const prompt = COMMIT_ANALYSIS_PROMPT
      .replace('{{status}}', status)
      .replace('{{diff}}', diff)
      .replace('{{log}}', log);

    console.debug('[GenerateCommitMessage] Calling Gemini API for commit analysis...');

    try {
      const response = await this.client.generateContent(
        [{ role: 'user', parts: [{ text: prompt }] }],
        {},
        signal,
      );

      const generatedText = getResponseText(response) ?? '';
      
      // Extract commit message from analysis (look for the message after </commit_analysis>)
      const analysisEndIndex = generatedText.indexOf('</commit_analysis>');
      if (analysisEndIndex !== -1) {
        const commitMessage = generatedText
          .substring(analysisEndIndex + '</commit_analysis>'.length)
          .trim()
          .replace(/^```[a-z]*\n?/, '')
          .replace(/```$/, '')
          .trim();
        
        return commitMessage || generatedText;
      }

      return generatedText;
    } catch (error) {
      console.error('[GenerateCommitMessage] Error during Gemini API call:', error);
      throw new Error(`Failed to generate commit message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private addGeminiSignature(commitMessage: string): string {
    // Return the commit message without any signature
    return commitMessage;
  }
}
