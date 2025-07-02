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
import { getResponseText } from '../utils/generateContentResponseUtilities.js';


const COMMIT_ANALYSIS_PROMPT = `You are an expert software engineer specializing in writing concise ` +
  `and meaningful git commit messages following the Conventional Commits format.

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
    commitMode: 'staged-only' | 'all-changes';
  } | null = null;

  private async analyzeGitState(signal: AbortSignal): Promise<{
    statusOutput: string;
    diffOutput: string;
    logOutput: string;
    commitMode: 'staged-only' | 'all-changes';
  }> {
    const [statusOutput, stagedDiff, unstagedDiff, logOutput] = await Promise.all([
      this.executeGitCommand(['status', '--porcelain'], signal),
      this.executeGitCommand(['diff', '--cached'], signal),
      this.executeGitCommand(['diff'], signal),
      this.executeGitCommand(['log', '--oneline', '-10'], signal)
    ]);

    const hasStagedChanges = Boolean(stagedDiff?.trim());
    const hasUnstagedChanges = Boolean(unstagedDiff?.trim());
    const hasUntrackedFiles = statusOutput?.includes('??') || false;


    let commitMode: 'staged-only' | 'all-changes';
    let diffOutput: string;

    if (hasStagedChanges && !hasUnstagedChanges && !hasUntrackedFiles) {
      commitMode = 'staged-only';
      diffOutput = stagedDiff!;
    } else {
      commitMode = 'all-changes';
      const diffs = [];
      if (stagedDiff) diffs.push(stagedDiff);
      if (unstagedDiff) diffs.push(unstagedDiff);
      diffOutput = diffs.join('\n');
    }

    return {
      statusOutput: statusOutput || '',
      diffOutput,
      logOutput: logOutput || '',
      commitMode
    };
  }

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
      const gitState = await this.analyzeGitState(signal);

      if (!gitState.diffOutput.trim()) {
        return false;
      }

      const commitMessage = await this.generateCommitMessage(
        gitState.statusOutput,
        gitState.diffOutput,
        gitState.logOutput,
        signal
      );

      const finalCommitMessage = this.addGeminiSignature(commitMessage);
      
      // Cache the data for execute method
      this.cachedCommitData = {
        statusOutput: gitState.statusOutput,
        diffOutput: gitState.diffOutput,
        logOutput: gitState.logOutput,
        commitMessage,
        finalCommitMessage,
        timestamp: Date.now(),
        commitMode: gitState.commitMode
      };

      // Determine which files will be committed for display
      const filesToCommit = this.parseFilesToBeCommitted(
        gitState.statusOutput, 
        gitState.commitMode === 'staged-only'
      );
      
      let filesDisplay = '';
      if (filesToCommit.length > 0) {
        filesDisplay = `\n\nFiles to be committed:\n` +
          `${filesToCommit.map(f => `  ${f}`).join('\n')}`;
      }

      const commitModeText = gitState.commitMode === 'staged-only' 
        ? 'staged changes only' 
        : 'all changes (staged & unstaged)';

      const confirmationDetails: ToolExecuteConfirmationDetails = {
        type: 'exec',
        title: 'Confirm Git Commit',
        command: `git commit ${gitState.commitMode === 'all-changes' ? '(will stage all changes) ' : ''}

Commit message:
${finalCommitMessage}

Strategy: ${commitModeText}${filesDisplay}`,
        rootCommand: 'git commit',
        onConfirm: async (outcome: ToolConfirmationOutcome) => {
          if (outcome === ToolConfirmationOutcome.ProceedAlways) {
            this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
          }
        },
      };
      return confirmationDetails;
    } catch (error) {
      console.error('Error determining commit confirmation details:', error);
      // If we can't gather git info or generate message, skip confirmation.
      // The execute method will then attempt the operations again and report the error.
      return false;
    }
  }

  async execute(_params: undefined, signal: AbortSignal): Promise<ToolResult> {
    try {
      let finalCommitMessage: string;
      let statusOutput: string;

      // Check if we have cached data from shouldConfirmExecute
      if (this.cachedCommitData && (Date.now() - this.cachedCommitData.timestamp < 30000)) {
        finalCommitMessage = this.cachedCommitData.finalCommitMessage;
        statusOutput = this.cachedCommitData.statusOutput;
        
        // Keep cache for staging strategy execution - don't clear yet
      } else {
        
        const gitState = await this.analyzeGitState(signal);
        statusOutput = gitState.statusOutput;

        if (!gitState.diffOutput.trim()) {
          return {
            llmContent: 'No changes detected in the current workspace.',
            returnDisplay: 'No changes detected in the current workspace.',
          };
        }

        const commitMessage = await this.generateCommitMessage(
          gitState.statusOutput,
          gitState.diffOutput,
          gitState.logOutput,
          signal
        );

        finalCommitMessage = this.addGeminiSignature(commitMessage);
        
        // Cache the data for staging strategy
        this.cachedCommitData = {
          statusOutput: gitState.statusOutput,
          diffOutput: gitState.diffOutput,
          logOutput: gitState.logOutput,
          commitMessage,
          finalCommitMessage,
          timestamp: Date.now(),
          commitMode: gitState.commitMode
        };
      }

      // Step 3: Handle staging based on cached strategy
      const cachedData = this.cachedCommitData;
      if (cachedData && cachedData.commitMode === 'all-changes') {
        await this.executeGitCommand(['add', '.'], signal);
      }

      // Step 4: Create commit
      
      try {
        await this.executeGitCommand(['commit', '-F', '-'], signal, finalCommitMessage);
        
        // Clear cache after successful commit
        this.cachedCommitData = null;
        
        // Step 5: Verify commit was successful
        await this.executeGitCommand(['status', '--porcelain'], signal);
        
        return {
          llmContent: `Commit created successfully!\n\nCommit message:\n${finalCommitMessage}`,
          returnDisplay: `Commit created successfully!\n\nCommit message:\n${finalCommitMessage}`,
        };
      } catch (commitError) {
        // Handle pre-commit hook modifications with comprehensive retry
        if (commitError instanceof Error && 
            (commitError.message.includes('pre-commit') || 
             commitError.message.includes('index.lock') ||
             commitError.message.includes('hook'))) {
          
          // Stage all modified files comprehensively
          await this.executeGitCommand(['add', '.'], signal);
          
          try {
            await this.executeGitCommand(['commit', '-F', '-'], signal, finalCommitMessage);
            
            // Clear cache after successful retry commit
            this.cachedCommitData = null;
            
            return {
              llmContent: `Commit created successfully after pre-commit hook modifications!\n\n` +
                `Commit message:\n${finalCommitMessage}`,
              returnDisplay: `Commit created successfully after pre-commit hook modifications!\n\n` +
                `Commit message:\n${finalCommitMessage}`,
            };
          } catch (retryError) {
            // If retry fails, provide detailed error information
            const errorDetails = retryError instanceof Error ? 
              retryError.message : String(retryError);
            throw new Error(`Commit failed after pre-commit hook retry. ` +
              `Original error: ${commitError.message}. Retry error: ${errorDetails}`);
          }
        }
        throw commitError;
      }

    } catch (error) {
      console.error('Error during execution:', error);
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
    stdin?: string,
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const commandString = `git ${args.join(' ')}`;
      
      try {
        const child = spawn('git', args, { signal, stdio: 'pipe' });
        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        // Write stdin if provided
        if (stdin && child.stdin) {
          child.stdin.write(stdin);
          child.stdin.end();
        }

        child.on('close', (exitCode) => {
          if (exitCode !== 0) {
            const errorMessage = this.formatGitError(args, exitCode ?? -1, stderr);
            console.error(`Command failed: ${commandString}, Error: ${errorMessage}`);
            reject(new Error(errorMessage));
          } else {
            resolve(stdout.trim() || null);
          }
        });

        child.on('error', (err) => {
          const errorMessage = `Failed to execute git command '${commandString}': ${err.message}`;
          console.error(`Spawn error: ${errorMessage}`);
          
          // Provide helpful error context
          if (err.message.includes('ENOENT')) {
            reject(new Error(`Git is not installed or not found in PATH. ` +
              `Please install Git and try again.`));
                      } else if (err.message.includes('EACCES')) {
              reject(new Error(`Permission denied when executing git command. ` +
                `Please check file permissions.`));
          } else {
            reject(new Error(errorMessage));
          }
        });

        // Handle abort signal
        signal.addEventListener('abort', () => {
          child.kill('SIGTERM');
          reject(new Error(`Git command '${commandString}' was aborted`));
        });

        if (signal.aborted) {
          child.kill('SIGTERM');
          reject(new Error(`Git command '${commandString}' was aborted before starting`));
          return;
        }
        
      } catch (error) {
        const errorMessage = `Failed to spawn git process: ` +
          `${error instanceof Error ? error.message : String(error)}`;
        console.error(`Spawn setup error: ${errorMessage}`);
        reject(new Error(errorMessage));
      }
    });
  }

  private formatGitError(args: string[], exitCode: number, stderr: string): string {
    const command = args.join(' ');
    const baseError = `Git command failed (${command}) with exit code ${exitCode}`;
    
    if (!stderr.trim()) {
      return `${baseError}: No error details available`;
    }

    // Provide more specific error messages for common scenarios
    if (stderr.includes('not a git repository')) {
      return 'This directory is not a Git repository. ' +
        'Please run this command from within a Git repository.';
    } else if (stderr.includes('no changes added to commit')) {
      return 'No changes have been staged for commit. Use "git add" to stage changes first.';
    } else if (stderr.includes('nothing to commit')) {
      return 'No changes detected. There is nothing to commit.';
    } else if (stderr.includes('index.lock')) {
      return 'Git index is locked. Another git process may be running. Please wait and try again.';
    } else if (stderr.includes('refusing to merge unrelated histories')) {
      return 'Cannot merge unrelated Git histories. ' +
        'This may require manual intervention.';
    } else if (stderr.includes('pathspec') && stderr.includes('did not match any files')) {
      return 'No files match the specified path. ' +
        'Please check the file paths and try again.';
    } else if (stderr.includes('fatal: could not read') || 
               stderr.includes('fatal: unable to read')) {
      return 'Unable to read Git repository data. The repository may be corrupted.';
    } else {
      return `${baseError}: ${stderr.trim()}`;
    }
  }

  private parseFilesToBeCommitted(statusOutput: string, hasStagedChanges: boolean): string[] {
    const lines = statusOutput.split('\n').filter(line => line.trim());
    const files: string[] = [];

    for (const line of lines) {
      if (line.length < 3) continue;
      
      const status = line.substring(0, 2);
      const filename = line.substring(3).trim();
      
      // Skip files in node_modules and .git
      if (filename.includes('node_modules/') || filename.includes('.git/')) continue;
      
      // If we have staged changes, only show staged files
      if (hasStagedChanges) {
        // First character represents staged status
        if (status[0] !== ' ' && status[0] !== '?') {
          files.push(filename);
        }
      } else {
        // If no staged changes, show all modified and untracked files
        if (status[0] !== ' ' || status[1] !== ' ') {
          files.push(filename);
        }
      }
    }

    return files;
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
      console.error('Error during Gemini API call:', error);
      throw new Error(`Failed to generate commit message: ` +
        `${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private addGeminiSignature(commitMessage: string): string {
    // Return the commit message without any signature
    return commitMessage;
  }
}
