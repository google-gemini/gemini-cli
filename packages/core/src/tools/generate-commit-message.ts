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
import { spawn, ChildProcess } from 'child_process';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';

// ============================================================================
// Type Definitions
// ============================================================================

interface CommitAnalysis {
  changedFiles: string[];
  changeType: 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'perf' | 'test' | 'build' | 'ci' | 'chore' | 'revert';
  scope?: string;
  purpose: string;
  impact: string;
  hasSensitiveInfo: boolean;
}

interface CommitMessageParts {
  header: string;
  body?: string;
  footer?: string;
}

interface AICommitResponse {
  analysis: CommitAnalysis;
  commitMessage: CommitMessageParts;
}

interface GitState {
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
  hasUntrackedFiles: boolean;
  hasDeletedFiles: boolean;
  hasRenamedFiles: boolean;
  hasConflicts: boolean;
  modifiedFileCount: number;
  addedFileCount: number;
  deletedFileCount: number;
  untrackedFileCount: number;
  stagedFileCount: number;
  unstagedFileCount: number;
  totalChangedFiles: number;
}

interface CachedCommitData {
  statusOutput: string;
  diffOutput: string;
  logOutput: string;
  commitMessage: string;
  finalCommitMessage: string;
  timestamp: number;
  commitMode: 'staged-only' | 'all-changes';
  indexHash: string;
}

type CommitMode = 'staged-only' | 'all-changes';

interface ErrorDetails {
  message: string;
  originalError: Error | null;
}

// ============================================================================
// Constants
// ============================================================================

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
You MUST respond with a valid JSON object in the following format:
{
  "analysis": {
    "changedFiles": ["list of files"],
    "changeType": "feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert",
    "scope": "optional scope string",
    "purpose": "description of why these changes were made",
    "impact": "description of the impact on the project",
    "hasSensitiveInfo": false
  },
  "commitMessage": {
    "header": "type(scope): subject",
    "body": "optional body text",
    "footer": "optional footer text"
  }
}

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

const VALID_CHANGE_TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
const CACHE_MAX_AGE_MS = 30000;

// ============================================================================
// Main Tool Implementation
// ============================================================================

export class GenerateCommitMessageTool extends BaseTool<undefined, ToolResult> {
  static readonly Name = 'generate_commit_message';
  private readonly client: GeminiClient;
  private readonly config: Config;
  
  // Cache generated commit message to avoid regeneration
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
  }

  validateToolParams(_params: undefined): string | null {
    return null;
  }

  getDescription(_params: undefined): string {
    return 'Analyze git changes and create commit.';
  }

  // ============================================================================
  // Public Tool Methods
  // ============================================================================

  async shouldConfirmExecute(
    _params: undefined,
    signal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    try {
      const [statusOutput, stagedDiff, unstagedDiff, logOutput] = await Promise.all([
        this.executeGitCommand(['status', '--porcelain'], signal),
        this.executeGitCommand(['diff', '--cached'], signal),
        this.executeGitCommand(['diff'], signal),
        this.executeGitCommand(['log', '--oneline', '-10'], signal)
      ]);
      
      const gitState = this.analyzeGitState(statusOutput || '', stagedDiff || '', unstagedDiff || '');
      const commitMode = this.determineCommitStrategy(gitState);

      const diffForAI = commitMode === 'staged-only' ? 
        (stagedDiff || '') : 
        [stagedDiff, unstagedDiff].filter(d => d?.trim()).join('\n');

      if (!diffForAI?.trim()) {
        return false;
      }

      const commitMessage = await this.generateCommitMessage(
        statusOutput || '',
        diffForAI,
        logOutput || '',
        signal
      );
      
      if (!commitMessage?.trim()) {
        throw new Error('The AI failed to generate a valid commit message.');
      }
      
      const finalCommitMessage = this.addGeminiSignature(commitMessage);
      const indexHash = await this.getReliableIndexHash(commitMode, signal);
      
      this.cachedCommitData = {
        statusOutput: statusOutput || '',
        diffOutput: diffForAI,
        logOutput: logOutput || '',
        commitMessage,
        finalCommitMessage,
        timestamp: Date.now(),
        commitMode,
        indexHash
      };

      const filesToCommit = this.parseFilesToBeCommitted(statusOutput || '', commitMode === 'staged-only');
      
      let filesDisplay = '';
      if (filesToCommit.length > 0) {
        filesDisplay = `\n\nFiles to be committed:\n${filesToCommit.map(f => `  - ${f}`).join('\n')}`;
      }

      const confirmationDetails: ToolExecuteConfirmationDetails = {
        type: 'exec',
        title: 'Confirm Git Commit',
        command: `Commit with message:\n\n${finalCommitMessage}${filesDisplay}`,
        rootCommand: 'git-commit',
        onConfirm: async (outcome: ToolConfirmationOutcome) => {
          if (outcome === ToolConfirmationOutcome.ProceedAlways) {
            this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
          }
        },
      };
      return confirmationDetails;
    } catch (error) {
      const errorDetails = this.formatExecutionError(error);
      throw new Error(errorDetails.message);
    }
  }

  async execute(_params: undefined, signal: AbortSignal): Promise<ToolResult> {
    console.debug('[GenerateCommitMessage] Starting git commit workflow...');

    try {
      let finalCommitMessage: string;
      let statusOutput: string;

      if (this.cachedCommitData && await this.isCacheValid(signal)) {
        console.debug('[GenerateCommitMessage] Using cached commit message from confirmation...');
        
        finalCommitMessage = this.cachedCommitData.finalCommitMessage;
        statusOutput = this.cachedCommitData.statusOutput;
      } else {
        console.debug('[GenerateCommitMessage] No valid cache, generating fresh commit message...');
        
        const [statusOut, stagedDiff, unstagedDiff, logOutput] = await Promise.all([
          this.executeGitCommand(['status', '--porcelain'], signal),
          this.executeGitCommand(['diff', '--cached'], signal),
          this.executeGitCommand(['diff'], signal),
          this.executeGitCommand(['log', '--oneline', '-10'], signal)
        ]);
        
        const gitState = this.analyzeGitState(statusOut || '', stagedDiff || '', unstagedDiff || '');
        const commitMode = this.determineCommitStrategy(gitState);
        
        const diffForAI = commitMode === 'staged-only' ? 
          (stagedDiff || '') : 
          [stagedDiff, unstagedDiff].filter(d => d?.trim()).join('\n');

        statusOutput = statusOut || '';

        if (!diffForAI?.trim()) {
          return {
            llmContent: 'No changes detected in the current workspace.',
            returnDisplay: 'No changes detected in the current workspace.',
          };
        }

        const commitMessage = await this.generateCommitMessage(
          statusOutput,
          diffForAI,
          logOutput || '',
          signal
        );

        finalCommitMessage = this.addGeminiSignature(commitMessage);
      }

      const cachedData = this.cachedCommitData;
      if (cachedData) {
        await this.executeCommitStrategy(cachedData.commitMode, signal);
      } else {
        const currentStagedDiff = await this.executeGitCommand(['diff', '--cached'], signal);
        const currentUnstagedDiff = await this.executeGitCommand(['diff'], signal);
        const currentGitState = this.analyzeGitState(statusOutput, currentStagedDiff || '', currentUnstagedDiff || '');
        const currentCommitMode = this.determineCommitStrategy(currentGitState);
        
        await this.executeCommitStrategy(currentCommitMode, signal);
      }

      console.debug('[GenerateCommitMessage] Creating commit with message:', finalCommitMessage.substring(0, 100) + '...');
      
      try {
        await this.executeGitCommand(['commit', '-F', '-'], signal, finalCommitMessage);
        this.cachedCommitData = null;
        await this.executeGitCommand(['status', '--porcelain'], signal);
        
        return {
          llmContent: `Commit created successfully!\n\nCommit message:\n${finalCommitMessage}`,
          returnDisplay: `Commit created successfully!\n\nCommit message:\n${finalCommitMessage}`,
        };
      } catch (commitError) {
        if (commitError instanceof Error && 
            (commitError.message.includes('pre-commit') || 
             commitError.message.includes('index.lock') ||
             commitError.message.includes('hook'))) {
          console.debug('[GenerateCommitMessage] Pre-commit hook or staging issue detected, implementing comprehensive retry...');
          
          await this.executeGitCommand(['add', '.'], signal);
          
          try {
            await this.executeGitCommand(['commit', '-F', '-'], signal, finalCommitMessage);
            this.cachedCommitData = null;
            
            return {
              llmContent: `Commit created successfully after pre-commit hook modifications!\n\nCommit message:\n${finalCommitMessage}`,
              returnDisplay: `Commit created successfully after pre-commit hook modifications!\n\nCommit message:\n${finalCommitMessage}`,
            };
          } catch (retryError) {
            const errorDetails = retryError instanceof Error ? retryError.message : String(retryError);
            throw new Error(`Commit failed after pre-commit hook retry. Original error: ${commitError.message}. Retry error: ${errorDetails}`);
          }
        }
        throw commitError;
      }
    } catch (error) {
      console.error('[GenerateCommitMessage] Error during execution:', error);
      const errorDetails = this.formatExecutionError(error);
      return {
        llmContent: `Error during commit workflow: ${errorDetails.message}`,
        returnDisplay: `Error during commit workflow: ${errorDetails.message}`,
      };
    }
  }

  // ============================================================================
  // Git Command Execution
  // ============================================================================

  private async executeGitCommand(
    args: string[],
    signal: AbortSignal,
    stdin?: string,
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const commandString = `git ${args.join(' ')}`;
      console.debug(`[GenerateCommitMessage] Executing: ${commandString}`);
      
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

        this.handleStdinWrite(child, stdin, reject);
        this.handleProcessEvents(child, commandString, stdout, stderr, resolve, reject);
        
        if (signal.aborted) {
          reject(new Error(`Git command '${commandString}' was aborted before starting`));
          return;
        }
        
      } catch (error) {
        const errorMessage = `Failed to spawn git process: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[GenerateCommitMessage] Spawn setup error: ${errorMessage}`);
        reject(new Error(errorMessage));
      }
    });
  }

  private handleStdinWrite(child: ChildProcess, stdin: string | undefined, reject: (error: Error) => void): void {
    if (stdin && child.stdin) {
      child.stdin.on('error', (err: Error & { code?: string }) => {
        const errorMessage = this.formatStdinError(err);
        console.error(`[GenerateCommitMessage] stdin write error: ${errorMessage}`);
        reject(new Error(errorMessage));
      });
      
      try {
        const writePromise = new Promise<void>((resolve, writeReject) => {
          if (!child.stdin) {
            writeReject(new Error('stdin stream is not available'));
            return;
          }
          
          const writeResult = child.stdin.write(stdin, (writeError) => {
            if (writeError) {
              const errorMessage = this.formatStdinWriteError(writeError as Error & { code?: string });
              console.error(`[GenerateCommitMessage] Stdin write callback error: ${errorMessage}`);
              writeReject(new Error(errorMessage));
            } else {
              resolve();
            }
          });
          
          if (!writeResult) {
            child.stdin.once('drain', () => resolve());
          } else {
            resolve();
          }
        });
        
        writePromise
          .then(() => {
            if (child.stdin) {
              child.stdin.end();
            }
          })
          .catch((writeError) => {
            const errorMessage = writeError instanceof Error ? writeError.message : String(writeError);
            console.error(`[GenerateCommitMessage] Stdin write promise error: ${errorMessage}`);
            reject(new Error(errorMessage));
          });
      } catch (stdinError) {
        const errorMessage = this.formatStdinWriteError(stdinError as Error & { code?: string });
        console.error(`[GenerateCommitMessage] Stdin write error: ${errorMessage}`);
        reject(new Error(errorMessage));
        return;
      }
    }
  }

  private handleProcessEvents(
    child: ChildProcess,
    commandString: string,
    stdout: string,
    stderr: string,
    resolve: (value: string | null) => void,
    reject: (error: Error) => void
  ): void {
    child.on('close', (exitCode: number) => {
      if (exitCode !== 0) {
        const errorMessage = this.formatGitError(commandString.split(' ').slice(1), exitCode ?? -1, stderr);
        console.error(`[GenerateCommitMessage] Command failed: ${commandString}, Error: ${errorMessage}`);
        reject(new Error(errorMessage));
      } else {
        console.debug(`[GenerateCommitMessage] Command succeeded: ${commandString}`);
        resolve(stdout.trim() || null);
      }
    });

    child.on('error', (err: Error & { code?: string }) => {
      const errorMessage = this.formatSpawnError(commandString, err);
      console.error(`[GenerateCommitMessage] Spawn error: ${errorMessage}`);
      reject(new Error(errorMessage));
    });
  }

  // ============================================================================
  // Git State Analysis
  // ============================================================================

  private analyzeGitState(statusOutput: string, stagedDiff: string, unstagedDiff: string): GitState {
    const lines = statusOutput.split('\n').filter(line => line.trim());
    return {
      hasStagedChanges: stagedDiff.trim() !== '',
      hasUnstagedChanges: unstagedDiff.trim() !== '',
      hasUntrackedFiles: statusOutput.includes('??'),
      hasDeletedFiles: lines.some(line => line.includes(' D ') || line.includes('D ')),
      hasRenamedFiles: lines.some(line => line.includes(' R ') || line.includes('R ')),
      hasConflicts: lines.some(line => line.includes('UU') || line.includes('AA') || line.includes('DD') || line.includes('AU') || line.includes('UA')),
      modifiedFileCount: lines.filter(line => line.includes(' M ') || line.includes('M ')).length,
      addedFileCount: lines.filter(line => line.includes('A ') || line.includes(' A')).length,
      deletedFileCount: lines.filter(line => line.includes(' D ') || line.includes('D ')).length,
      untrackedFileCount: lines.filter(line => line.includes('??')).length,
      stagedFileCount: lines.filter(line => line.length >= 2 && line[0] !== ' ' && line[0] !== '?').length,
      unstagedFileCount: lines.filter(line => line.length >= 2 && line[1] !== ' ' && line[1] !== '?').length,
      totalChangedFiles: lines.length
    };
  }

  private determineCommitStrategy(gitState: GitState): CommitMode {
    if (gitState.hasConflicts) {
      throw new Error('Git conflicts detected. Please resolve conflicts before committing.');
    }

    if (gitState.hasStagedChanges) {
      return 'staged-only';
    }

    if (gitState.hasUnstagedChanges || gitState.hasUntrackedFiles) {
      return 'all-changes';
    }

    return 'staged-only';
  }

  private parseUntrackedFiles(statusOutput: string): string[] {
    return statusOutput
      .split('\n')
      .filter(line => line.startsWith('??'))
      .map(line => line.substring(3).trim())
      .filter(file => !file.includes('node_modules/') && !file.includes('.git/'));
  }

  private parseFilesToBeCommitted(statusOutput: string, hasStagedChanges: boolean): string[] {
    const lines = statusOutput.split('\n').filter(line => line.trim());
    const files: string[] = [];

    for (const line of lines) {
      if (line.length < 3) continue;
      
      const status = line.substring(0, 2);
      const filename = line.substring(3).trim();
      
      if (filename.includes('node_modules/') || filename.includes('.git/')) continue;
      
      if (hasStagedChanges) {
        if (status[0] !== ' ' && status[0] !== '?') {
          files.push(filename);
        }
      } else {
        if (status[0] !== ' ' || status[1] !== ' ') {
          files.push(filename);
        }
      }
    }

    return files;
  }

  private async executeCommitStrategy(commitMode: CommitMode, signal: AbortSignal): Promise<void> {
    if (commitMode === 'all-changes') {
      console.debug('[GenerateCommitMessage] Executing all-changes strategy: staging all files');
      await this.executeGitCommand(['add', '.'], signal);
    } else {
      console.debug('[GenerateCommitMessage] Executing staged-only strategy: committing staged files only');
    }
  }

  // ============================================================================
  // AI Integration
  // ============================================================================

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
      const parsedResponse = this.parseAIResponse(generatedText);
      
      if (parsedResponse.analysis.hasSensitiveInfo) {
        console.warn('[GenerateCommitMessage] AI detected potentially sensitive information in changes');
        throw new Error('Commit contains potentially sensitive information. Review the changes and try again.');
      }
      
      return this.buildCommitMessage(parsedResponse.commitMessage);
    } catch (error) {
      console.error('[GenerateCommitMessage] Error during Gemini API call:', error);
      throw this.formatAPIError(error);
    }
  }

  private parseAIResponse(generatedText: string): AICommitResponse {
    const errors: string[] = [];
    
    try {
      // First, try to extract JSON from markdown code blocks
      const codeBlockMatch = generatedText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        try {
          const jsonResponse = JSON.parse(codeBlockMatch[1]) as AICommitResponse;
          const validationError = this.validateAIResponse(jsonResponse);
          if (validationError) {
            errors.push(`Code block JSON validation failed: ${validationError}`);
          } else {
            return jsonResponse;
          }
        } catch (parseError) {
          errors.push(`Code block JSON parsing failed: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
      }

      // If no code block or code block parsing failed, try to find the first complete JSON object
      let braceCount = 0;
      let startIndex = -1;
      let endIndex = -1;
      let inString = false;
      let escapeNext = false;

      for (let i = 0; i < generatedText.length; i++) {
        const char = generatedText[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') {
            if (braceCount === 0) {
              startIndex = i;
            }
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0 && startIndex !== -1) {
              endIndex = i;
              break;
            }
          }
        }
      }

      if (startIndex !== -1 && endIndex !== -1) {
        try {
          const jsonString = generatedText.substring(startIndex, endIndex + 1);
          const jsonResponse = JSON.parse(jsonString) as AICommitResponse;
          const validationError = this.validateAIResponse(jsonResponse);
          if (validationError) {
            errors.push(`Inline JSON validation failed: ${validationError}`);
          } else {
            return jsonResponse;
          }
        } catch (parseError) {
          errors.push(`Inline JSON parsing failed: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
      } else {
        errors.push('No JSON object structure found in response');
      }
      
      const errorSummary = errors.length > 0 ? errors.join('; ') : 'Unknown parsing error';
      console.debug('[GenerateCommitMessage] All JSON parsing attempts failed:', errors);
      console.debug('[GenerateCommitMessage] AI Response text (first 500 chars):', generatedText.substring(0, 500));
      
      throw new Error(`Failed to parse AI response as valid JSON. Attempted methods: ${errorSummary}. Please check AI model configuration and try again.`);
    } catch (jsonError) {
      if (jsonError instanceof Error && jsonError.message.includes('Failed to parse AI response')) {
        throw jsonError;
      }
      
      console.debug('[GenerateCommitMessage] Unexpected JSON parsing error:', jsonError);
      const errorMessage = jsonError instanceof Error ? jsonError.message : String(jsonError);
      throw new Error(`Unexpected error during AI response parsing: ${errorMessage}`);
    }
  }

  private validateAIResponse(response: unknown): string | null {
    if (!response || typeof response !== 'object') {
      return 'Response is not a valid object';
    }

    const obj = response as Record<string, unknown>;

    if (!obj.analysis) {
      return 'Missing required "analysis" field';
    }

    if (!obj.commitMessage) {
      return 'Missing required "commitMessage" field';
    }

    const analysisError = this.validateAnalysis(obj.analysis);
    if (analysisError) return analysisError;

    const commitMessageError = this.validateCommitMessage(obj.commitMessage);
    if (commitMessageError) return commitMessageError;

    return null;
  }

  private validateAnalysis(analysis: unknown): string | null {
    if (!analysis || typeof analysis !== 'object') {
      return 'AI response validation failed: analysis must be an object, received: ' + typeof analysis;
    }

    const analysisObj = analysis as Record<string, unknown>;

    if (!Array.isArray(analysisObj.changedFiles)) {
      return 'AI response validation failed: analysis.changedFiles must be an array, received: ' + typeof analysisObj.changedFiles;
    }

    if (analysisObj.changedFiles.length === 0) {
      return 'AI response validation failed: analysis.changedFiles must contain at least one file, but array is empty';
    }

    if (!analysisObj.changedFiles.every(file => typeof file === 'string')) {
      return 'AI response validation failed: all items in analysis.changedFiles must be strings';
    }

    if (typeof analysisObj.changeType !== 'string') {
      return 'AI response validation failed: analysis.changeType must be a string, received: ' + typeof analysisObj.changeType;
    }

    if (!VALID_CHANGE_TYPES.includes(analysisObj.changeType)) {
      return `AI response validation failed: analysis.changeType '${analysisObj.changeType}' is invalid. Must be one of: ${VALID_CHANGE_TYPES.join(', ')}`;
    }

    if (typeof analysisObj.purpose !== 'string' || !analysisObj.purpose.trim()) {
      return 'AI response validation failed: analysis.purpose must be a non-empty string, received: ' + (typeof analysisObj.purpose === 'string' ? 'empty string' : typeof analysisObj.purpose);
    }

    if (analysisObj.purpose && analysisObj.purpose.length > 500) {
      return 'AI response validation failed: analysis.purpose exceeds maximum length of 500 characters';
    }

    if (typeof analysisObj.impact !== 'string' || !analysisObj.impact.trim()) {
      return 'AI response validation failed: analysis.impact must be a non-empty string, received: ' + (typeof analysisObj.impact === 'string' ? 'empty string' : typeof analysisObj.impact);
    }

    if (analysisObj.impact && analysisObj.impact.length > 500) {
      return 'AI response validation failed: analysis.impact exceeds maximum length of 500 characters';
    }

    if (typeof analysisObj.hasSensitiveInfo !== 'boolean') {
      return 'AI response validation failed: analysis.hasSensitiveInfo must be a boolean, received: ' + typeof analysisObj.hasSensitiveInfo;
    }

    if (analysisObj.scope !== undefined) {
      if (typeof analysisObj.scope !== 'string') {
        return 'AI response validation failed: analysis.scope must be a string when provided, received: ' + typeof analysisObj.scope;
      }
      if (analysisObj.scope.length > 50) {
        return 'AI response validation failed: analysis.scope exceeds maximum length of 50 characters';
      }
    }

    return null;
  }

  private validateCommitMessage(commitMessage: unknown): string | null {
    if (!commitMessage || typeof commitMessage !== 'object') {
      return 'AI response validation failed: commitMessage must be an object, received: ' + typeof commitMessage;
    }

    const commitObj = commitMessage as Record<string, unknown>;

    if (typeof commitObj.header !== 'string' || !commitObj.header.trim()) {
      return 'AI response validation failed: commitMessage.header must be a non-empty string, received: ' + (typeof commitObj.header === 'string' ? 'empty string' : typeof commitObj.header);
    }

    if (commitObj.header.length > 100) {
      return 'AI response validation failed: commitMessage.header exceeds maximum length of 100 characters';
    }

    const headerPattern = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .+/;
    if (!headerPattern.test(commitObj.header)) {
      return `AI response validation failed: commitMessage.header '${commitObj.header}' does not follow conventional commits format. Expected: type(scope): description`;
    }

    const scopeMatch = commitObj.header.match(/\((.+)\)/);
    if (scopeMatch && scopeMatch[1] && scopeMatch[1].length > 30) {
      return 'AI response validation failed: commit message scope exceeds maximum length of 30 characters';
    }

    // Enhanced validation for conventional commit structure
    const headerValidationError = this.validateConventionalCommitHeader(commitObj.header);
    if (headerValidationError) {
      return headerValidationError;
    }

    if (commitObj.body !== undefined) {
      if (typeof commitObj.body !== 'string') {
        return 'AI response validation failed: commitMessage.body must be a string when provided, received: ' + typeof commitObj.body;
      }
      if (commitObj.body.length > 2000) {
        return 'AI response validation failed: commitMessage.body exceeds maximum length of 2000 characters';
      }
      
      // Validate body format
      const bodyValidationError = this.validateCommitMessageBody(commitObj.body);
      if (bodyValidationError) {
        return bodyValidationError;
      }
    }

    if (commitObj.footer !== undefined) {
      if (typeof commitObj.footer !== 'string') {
        return 'AI response validation failed: commitMessage.footer must be a string when provided, received: ' + typeof commitObj.footer;
      }
      if (commitObj.footer.length > 500) {
        return 'AI response validation failed: commitMessage.footer exceeds maximum length of 500 characters';
      }
      
      // Validate footer format
      const footerValidationError = this.validateCommitMessageFooter(commitObj.footer);
      if (footerValidationError) {
        return footerValidationError;
      }
    }

    return null;
  }

  private validateConventionalCommitHeader(header: string): string | null {
    // More strict validation for conventional commit header
    const typePattern = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)/;
    const typeMatch = header.match(typePattern);
    
    if (!typeMatch) {
      return `AI response validation failed: commit header must start with a valid type (${VALID_CHANGE_TYPES.join(', ')})`;
    }

    // Check for optional scope
    const afterType = header.substring(typeMatch[0].length);
    if (afterType.startsWith('(')) {
      const scopeEndIndex = afterType.indexOf(')');
      if (scopeEndIndex === -1) {
        return 'AI response validation failed: commit header scope is not properly closed with )';
      }
      
      const scope = afterType.substring(1, scopeEndIndex);
      if (!scope.trim()) {
        return 'AI response validation failed: commit header scope cannot be empty';
      }
      
      if (scope.includes(' ')) {
        return 'AI response validation failed: commit header scope cannot contain spaces';
      }
      
      const afterScope = afterType.substring(scopeEndIndex + 1);
      if (!afterScope.startsWith(': ')) {
        return 'AI response validation failed: commit header must have ": " after scope';
      }
      
      const description = afterScope.substring(2);
      if (!description.trim()) {
        return 'AI response validation failed: commit header description cannot be empty';
      }
    } else if (afterType.startsWith(': ')) {
      const description = afterType.substring(2);
      if (!description.trim()) {
        return 'AI response validation failed: commit header description cannot be empty';
      }
    } else {
      return 'AI response validation failed: commit header must have ": " after type or after scope';
    }

    return null;
  }

  private validateCommitMessageBody(body: string): string | null {
    // Body should use imperative mood and present tense
    if (body.trim().length === 0) {
      return null; // Empty body is valid
    }

    // Check for common anti-patterns in body
    const bodyLines = body.split('\n');
    for (const line of bodyLines) {
      if (line.trim().length === 0) continue;
      
      // Check for overly long lines
      if (line.length > 72) {
        return 'AI response validation failed: commit message body lines should not exceed 72 characters for readability';
      }
    }

    return null;
  }

  private validateCommitMessageFooter(footer: string): string | null {
    if (footer.trim().length === 0) {
      return null; // Empty footer is valid
    }

    // Footer should contain references or breaking changes
    const footerLines = footer.split('\n');
    for (const line of footerLines) {
      if (line.trim().length === 0) continue;
      
      // Check for breaking change format
      if (line.startsWith('BREAKING CHANGE:')) {
        const breakingDescription = line.substring('BREAKING CHANGE:'.length).trim();
        if (!breakingDescription) {
          return 'AI response validation failed: BREAKING CHANGE footer must include a description';
        }
      }
      
      // Check for issue reference format (simplified validation)
      if (line.match(/^(Closes?|Fixes?|Resolves?)\s+#\d+/i)) {
        continue; // Valid issue reference
      }
      
      // Check for co-authored-by format
      if (line.match(/^Co-authored-by:\s+.+\s+<.+@.+>/)) {
        continue; // Valid co-author
      }
    }

    return null;
  }

  private buildCommitMessage(commitParts: CommitMessageParts): string {
    let message = commitParts.header;
    
    if (commitParts.body && commitParts.body.trim()) {
      message += '\n\n' + commitParts.body.trim();
    }
    
    if (commitParts.footer && commitParts.footer.trim()) {
      message += '\n\n' + commitParts.footer.trim();
    }
    
    return message;
  }

  private addGeminiSignature(commitMessage: string): string {
    // Return the commit message without any signature
    return commitMessage;
  }

  // ============================================================================
  // Git Index Management
  // ============================================================================

  private async getGitIndexHash(signal: AbortSignal): Promise<string> {
    try {
      const indexHash = await this.executeGitCommand(['write-tree'], signal);
      return indexHash || '';
    } catch (error) {
      console.debug('[GenerateCommitMessage] Failed to get git index hash:', error);
      
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        
        if (errorMsg.includes('index.lock')) {
          throw new Error('Git index is locked by another process. Please wait for other Git operations to complete and try again.');
        } else if (errorMsg.includes('not a git repository')) {
          throw new Error('This directory is not a Git repository. Please run this command from within a Git repository.');
        } else if (errorMsg.includes('permission denied') || errorMsg.includes('eacces')) {
          throw new Error('Permission denied when accessing Git index. Please check file permissions and try again.');
        } else if (errorMsg.includes('corrupt')) {
          throw new Error('Git index appears to be corrupted. Try running "git reset" or "git fsck" to repair the repository.');
        } else if (errorMsg.includes('no such file')) {
          throw new Error('Git index file is missing. The repository may need to be reinitialized.');
        }
      }
      
      throw new Error(`Failed to read git index state: ${error instanceof Error ? error.message : String(error)}. This is required for safe commit operations.`);
    }
  }

  private async getReliableIndexHash(commitMode: CommitMode, signal: AbortSignal): Promise<string> {
    try {
      if (commitMode === 'staged-only') {
        return await this.getGitIndexHash(signal);
      }

      console.debug('[GenerateCommitMessage] Temporarily staging files to calculate reliable index hash...');
      
      const originalStatus = await this.executeGitCommand(['status', '--porcelain'], signal);
      const originalIndexHash = await this.getGitIndexHash(signal);
      
      let hasTemporaryChanges = false;
      
      try {
        await this.executeGitCommand(['add', '.'], signal);
        hasTemporaryChanges = true;
        
        const newIndexHash = await this.getGitIndexHash(signal);
        const stagedHash = newIndexHash;
        
        await this.executeGitCommand(['reset', 'HEAD'], signal);
        hasTemporaryChanges = false;
        
        const restoredStatus = await this.executeGitCommand(['status', '--porcelain'], signal);
        if (originalStatus !== restoredStatus) {
          const statusDifference = this.analyzeStatusDifference(originalStatus || '', restoredStatus || '');
          if (statusDifference.hasSignificantChanges) {
            throw new Error(`Failed to restore git index to its original state after calculating commit hash. ${statusDifference.description}. Original: ${statusDifference.originalCount} files, Restored: ${statusDifference.restoredCount} files`);
          }
        }
        
        return stagedHash;
      } catch (tempError) {
        if (hasTemporaryChanges) {
          try {
            await this.executeGitCommand(['reset', 'HEAD'], signal);
            
            const restoredStatus = await this.executeGitCommand(['status', '--porcelain'], signal);
            if (originalStatus !== restoredStatus) {
              const statusDifference = this.analyzeStatusDifference(originalStatus || '', restoredStatus || '');
              throw new Error(`Failed to restore git index to its original state during error recovery: ${statusDifference.description}. Original state cannot be guaranteed, repository integrity may be compromised. Manual verification recommended: run 'git status' to check current state.`);
            }
          } catch (resetError) {
            console.error('[GenerateCommitMessage] Critical: Failed to restore index after temporary staging:', resetError);
            throw new Error(`Critical: Failed to restore git index after temporary staging. Please check 'git status' and manually restore if needed. Temporary staging error: ${tempError instanceof Error ? tempError.message : String(tempError)}. Reset error: ${resetError instanceof Error ? resetError.message : String(resetError)}`);
          }
        }
        
        console.debug('[GenerateCommitMessage] Temporary staging failed, falling back to original hash:', tempError);
        
        if (tempError instanceof Error) {
          const errorMsg = tempError.message.toLowerCase();
          if (errorMsg.includes('index.lock')) {
            throw new Error('Git index is locked during hash calculation. Please wait for other git operations to complete and try again.');
          } else if (errorMsg.includes('permission denied')) {
            throw new Error('Permission denied during temporary staging for hash calculation. Please check file permissions.');
          }
        }
        
        return originalIndexHash;
      }
    } catch (error) {
      console.debug('[GenerateCommitMessage] Failed to get reliable git index hash:', error);
      
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes('critical')) {
          throw error;
        } else if (errorMsg.includes('not a git repository')) {
          throw new Error('Cannot calculate git index hash: not in a git repository.');
        } else if (errorMsg.includes('index.lock')) {
          throw new Error('Git index is locked. Please wait for other git operations to complete and try again.');
        }
      }
      
      throw new Error(`Failed to calculate reliable git index state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  private async isCacheValid(signal: AbortSignal): Promise<boolean> {
    if (!this.cachedCommitData) {
      return false;
    }

    try {
      const cacheAge = Date.now() - this.cachedCommitData.timestamp;
      if (cacheAge > CACHE_MAX_AGE_MS) {
        console.debug('[GenerateCommitMessage] Cache expired (age: %dms)', cacheAge);
        this.cachedCommitData = null;
        return false;
      }

      let currentIndexHash: string;
      try {
        currentIndexHash = await this.getReliableIndexHash(this.cachedCommitData.commitMode, signal);
      } catch (indexError) {
        console.debug('[GenerateCommitMessage] Failed to get current index hash for cache validation:', indexError);
        this.cachedCommitData = null;
        return false;
      }
      
      if (currentIndexHash !== this.cachedCommitData.indexHash) {
        console.debug('[GenerateCommitMessage] Cache invalidated due to index change');
        this.cachedCommitData = null;
        throw new Error('Git index has changed since confirmation. Please run the command again to generate an accurate commit message.');
      }

      let currentStatus: string | null;
      try {
        currentStatus = await this.executeGitCommand(['status', '--porcelain'], signal);
      } catch (statusError) {
        console.debug('[GenerateCommitMessage] Failed to get current status for cache validation:', statusError);
        this.cachedCommitData = null;
        return false;
      }
      
      const currentStatusContent = (currentStatus || '').split('\n').filter(line => line.trim());
      const cachedStatusContent = this.cachedCommitData.statusOutput.split('\n').filter(line => line.trim());
      
      const statusContentDifference = this.analyzeStatusDifference(this.cachedCommitData.statusOutput, currentStatus || '');
      const significantDifferences = statusContentDifference.hasSignificantChanges ? [statusContentDifference.description] : [];
      
      if (currentStatusContent.length !== cachedStatusContent.length || significantDifferences.length > 0) {
        console.debug('[GenerateCommitMessage] Status changes detected (lines: %d vs %d): %s', 
          currentStatusContent.length, cachedStatusContent.length, statusContentDifference.description);
        
        if (statusContentDifference.hasSignificantChanges) {
          console.debug('[GenerateCommitMessage] Significant status differences detected:', statusContentDifference.description);
          this.cachedCommitData = null;
          throw new Error(`Working directory status has changed since confirmation: ${statusContentDifference.description}. Please run the command again to ensure accuracy.`);
        } else {
          console.debug('[GenerateCommitMessage] Status differences are trivial (%s), cache remains valid', statusContentDifference.description);
        }
      }

      return true;
    } catch (error) {
      console.debug('[GenerateCommitMessage] Cache validation failed:', error);
      this.cachedCommitData = null;
      
      if (error instanceof Error && 
          (error.message.includes('Git index has changed') || 
           error.message.includes('Working directory status has changed'))) {
        throw error;
      }
      
      console.debug('[GenerateCommitMessage] Cache validation error handled gracefully, continuing without cache');
      return false;
    }
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  private formatStdinError(err: Error & { code?: string }): string {
    let errorMessage = `Failed to write to git process stdin: ${err.message}`;
    
    if (err.code === 'EPIPE') {
      errorMessage = 'Git process closed unexpectedly before commit message could be written. This typically occurs when git exits early due to hooks, validation failures, or system resource issues. Check git hooks and system resources.';
    } else if (err.code === 'ECONNRESET') {
      errorMessage = 'Connection to git process was forcibly reset while writing commit message. This may indicate system resource constraints, git process crashes, or network issues in distributed setups. Please try again.';
    } else if (err.code === 'EAGAIN' || err.code === 'EWOULDBLOCK') {
      errorMessage = 'Git process is temporarily busy and cannot accept input. This suggests high system load or git lock contention. Please wait a moment and try again.';
    } else if (err.code === 'EMFILE' || err.code === 'ENFILE') {
      errorMessage = 'System has reached file descriptor limit while communicating with git process. Close other applications or increase system limits.';
    } else if (err.code === 'ENOSPC') {
      errorMessage = 'No space left on device while writing to git process. Free up disk space and try again.';
    }
    
    return errorMessage;
  }

  private formatStdinWriteError(error: Error & { code?: string }): string {
    let errorMessage = `Failed to write to git process stdin: ${error.message}`;
    
    if (error.code === 'EPIPE') {
      errorMessage = 'Git process terminated unexpectedly during commit message transmission. This indicates the git process exited before receiving the full commit message, often due to pre-commit hooks, validation errors, or system interruptions. Check git hooks and system stability.';
    } else if (error.code === 'EBADF') {
      errorMessage = 'Git process stdin is not available for writing. The file descriptor is invalid or closed, indicating a git process communication failure. This may be caused by git configuration issues or process lifecycle problems.';
    } else if (error.code === 'EINVAL') {
      errorMessage = 'Invalid commit message format provided to git process. The commit message contains invalid characters or formatting that git cannot process.';
    } else if (error.code === 'ECONNRESET') {
      errorMessage = 'Git process connection was reset during commit message write operation. This suggests the git process crashed or was forcibly terminated. Please verify git installation and try again.';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Timeout occurred while writing commit message to git process. The git process is not responding, possibly due to hung hooks or system resource issues.';
    }
    
    return errorMessage;
  }

  private formatGitError(args: string[], exitCode: number, stderr: string): string {
    const command = args.join(' ');
    const baseError = `Git command failed (${command}) with exit code ${exitCode}`;
    
    if (!stderr.trim()) {
      return `${baseError}: No error details available. This may indicate a silent git failure or configuration issue.`;
    }

    if (stderr.includes('not a git repository')) {
      return 'This directory is not a Git repository. Please navigate to a git repository directory or run "git init" to initialize a new repository.';
    } else if (stderr.includes('no changes added to commit')) {
      return 'No changes have been staged for commit. Use "git add <files>" to stage specific files or "git add ." to stage all changes before committing.';
    } else if (stderr.includes('nothing to commit')) {
      return 'No changes detected in the working directory. Make changes to files and stage them with "git add" before attempting to commit.';
    } else if (stderr.includes('index.lock')) {
      return 'Git index is locked by another process. This indicates another git operation is in progress. Wait for it to complete or remove .git/index.lock if the process is stuck.';
    } else if (stderr.includes('refusing to merge unrelated histories')) {
      return 'Cannot merge unrelated Git histories. Use "git pull --allow-unrelated-histories" to force merge, or check if you\'re in the correct repository.';
    } else if (stderr.includes('pathspec') && stderr.includes('did not match any files')) {
      return 'No files match the specified path pattern. Verify file paths exist and check for typos in file names or patterns.';
    } else if (stderr.includes('fatal: could not read') || stderr.includes('fatal: unable to read')) {
      return 'Unable to read Git repository data. The repository may be corrupted. Try "git fsck" to check integrity or restore from backup.';
    } else if (stderr.includes('Permission denied') || stderr.includes('permission denied')) {
      return 'Permission denied accessing Git repository. Check file permissions and ensure you have read/write access to the repository directory.';
    } else if (stderr.includes('disk space') || stderr.includes('No space left')) {
      return 'Insufficient disk space for Git operation. Free up disk space and try again.';
    } else if (stderr.includes('bad signature') || stderr.includes('corrupt')) {
      return 'Git repository corruption detected. Run "git fsck --full" to check integrity and consider restoring from a clean backup.';
    } else if (stderr.includes('reference') && stderr.includes('not found')) {
      return 'Git reference not found. This may indicate a missing branch or corrupted repository. Check "git branch -a" to see available branches.';
    } else {
      return `${baseError}: ${stderr.trim()}. Check git configuration and repository state.`;
    }
  }

  private formatSpawnError(commandString: string, err: Error & { code?: string }): string {
    const errorMessage = `Failed to execute git command '${commandString}': ${err.message}`;

    if (err.code === 'ENOENT') {
      return 'Git is not installed or not found in PATH. Please install Git and try again.';
    } else if (err.code === 'EACCES') {
      return 'Permission denied when executing git command. Please check file permissions.';
    } else {
      return errorMessage;
    }
  }

  private formatAPIError(error: unknown): Error {
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      
      if (error.message.includes('JSON')) {
        return new Error(`AI response parsing failed: ${error.message}. The AI may have returned an unexpected format.`);
      } else if (error.message.includes('sensitive information')) {
        return error;
      } else if (errorMsg.includes('network') || errorMsg.includes('timeout') || errorMsg.includes('enotfound') || errorMsg.includes('econnrefused')) {
        return new Error(`Network error during commit message generation: ${error.message}. Please check your internet connection and try again.`);
      } else if (errorMsg.includes('api') || errorMsg.includes('quota') || errorMsg.includes('rate limit') || errorMsg.includes('billing')) {
        return new Error(`API error during commit message generation: ${error.message}. Please check your API key, quota, and billing status.`);
      } else if (errorMsg.includes('unauthorized') || errorMsg.includes('forbidden') || errorMsg.includes('401') || errorMsg.includes('403')) {
        return new Error(`Authentication error during commit message generation: ${error.message}. Please verify your API key is valid and has the necessary permissions.`);
      } else if (errorMsg.includes('model') || errorMsg.includes('unavailable') || errorMsg.includes('503')) {
        return new Error(`AI model error during commit message generation: ${error.message}. The model may be temporarily unavailable. Please try again later.`);
      } else if (errorMsg.includes('content') || errorMsg.includes('safety') || errorMsg.includes('policy')) {
        return new Error(`Content policy error during commit message generation: ${error.message}. The changes may have triggered safety filters.`);
      }
    }
    
    return new Error(`Failed to generate commit message: ${error instanceof Error ? error.message : String(error)}`);
  }

  private formatExecutionError(error: unknown): ErrorDetails {
    if (error instanceof Error) {
      const originalError = error;
      
      if (error.message.includes('Git is not installed')) {
        return {
          message: 'Git is not installed or not found in your system PATH. Please install Git and ensure it\'s accessible from the command line.',
          originalError
        };
      } else if (error.message.includes('not a git repository')) {
        return {
          message: 'This directory is not a Git repository. Please navigate to a Git repository or run "git init" to initialize one.',
          originalError
        };
      } else if (error.message.includes('no changes added to commit')) {
        return {
          message: 'No changes have been staged for commit. Make some changes to your files first, or use "git add" to stage existing changes.',
          originalError
        };
      } else if (error.message.includes('nothing to commit')) {
        return {
          message: 'No changes detected in your working directory. Make some changes to your files before creating a commit.',
          originalError
        };
      } else if (error.message.includes('index.lock')) {
        return {
          message: 'Git index is locked by another process. Please wait for the other Git operation to complete and try again.',
          originalError
        };
      } else if (error.message.includes('Git index has changed')) {
        return {
          message: 'Changes were detected in your Git repository after confirmation. This prevents committing unexpected changes. Please run the command again.',
          originalError
        };
      } else if (error.message.includes('Failed to generate commit message')) {
        return {
          message: 'Unable to generate commit message using AI. Please check your internet connection and API configuration.',
          originalError
        };
      } else {
        return {
          message: `${error.message}`,
          originalError
        };
      }
    } else {
      return {
        message: `Unexpected error occurred: ${String(error)}`,
        originalError: null
      };
    }
  }

  private analyzeStatusDifference(original: string, restored: string): {
    hasSignificantChanges: boolean;
    description: string;
    originalCount: number;
    restoredCount: number;
  } {
    const originalLines = (original || '').split('\n').filter(line => line.trim());
    const restoredLines = (restored || '').split('\n').filter(line => line.trim());
    
    const originalCount = originalLines.length;
    const restoredCount = restoredLines.length;
    
    const addedFiles = restoredLines.filter(line => !originalLines.includes(line));
    const removedFiles = originalLines.filter(line => !restoredLines.includes(line));
    
    const hasSignificantChanges = addedFiles.length > 0 || removedFiles.length > 0;
    
    let description = '';
    if (addedFiles.length > 0) {
      description += `${addedFiles.length} files unexpectedly added`;
    }
    if (removedFiles.length > 0) {
      if (description) description += ', ';
      description += `${removedFiles.length} files unexpectedly removed`;
    }
    if (!description) {
      description = 'minor status formatting differences';
    }
    
    return {
      hasSignificantChanges,
      description,
      originalCount,
      restoredCount
    };
  }
}