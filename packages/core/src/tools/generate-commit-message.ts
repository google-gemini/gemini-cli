/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Config } from '../config/config.js';
import { GeminiClient } from '../core/client.js';
import { spawn } from 'child_process';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';

const COMMIT_MESSAGE_PROMPT_LINES = [
  '',
  'You are a helpful assistant that generates commit messages in the Conventional Commits format.',
  '',
  '# Git diff',
  '@{{diff}}',
  '',
  '------',
  '',
  'Generate an English commit message that meets the friendly requirements of commitizen from git difft:',
  '',
  '# Examples',
  '',
  '```',
  'feat(home): add ad',
  '- Introduced the @ctrl/react-adsense package to enable Google AdSense integration in the application.',
  '- Updated package.json and pnpm-lock.yaml to include the new dependency.',
  '- Added the Adsense component in page.tsx to display ads, enhancing monetization opportunities.',
  '- Included a script tag in layout.tsx for loading the AdSense script asynchronously.',
  '',
  '',
  "These changes improve the application's revenue potential while maintaining a clean and organized codebase.",
  '```',
  '',
  '------',
  '',
  '```',
  'refactor(cmpts)!: rename input form',
  '- Renamed `InputForm.tsx` to `input-form.tsx` to follow consistent naming conventions.',
  '- Updated the import path in `app/page.tsx` to reflect the renamed file.',
  '',
  'BREAKING CHANGE: This change renames `InputForm.tsx` to `input-form.tsx`, which will require updates to any imports referencing the old file name.',
  '```',
  '',
  '------',
  '',
  '```',
  'feat(api): refactor client and improve hexagram',
  '- Replaced `openai` import with `createOpenAI` to allow for customizable settings.',
  '- Added support for custom OpenAI API base URL configuration.',
  '- Enhanced hexagram generation logic:',
  '  - Improved randomness simulation for hexagram line generation.',
  '  - Refactored `determineLineType` for better readability and error handling.',
  '  - Optimized transformation logic for moving lines.',
  '  - Standardized logging format for debug messages.',
  '  - Updated hexagram data structure for consistency and clarity.',
  '  - Fixed typos and logical errors in several hexagram mappings.',
  '',
  'These changes improve code readability, maintainability, and debugging efficiency.',
  '```',
  '',
  '# Overview',
  '',
  'Each commit message must follow a structured format and remain succinct and clear. The message consists of three parts—a header (all lowercase), a body (capitalized at the beginning of every line), and a footer. The header is mandatory and must conform to the following format: `type(scope): subject`. The body must begin with one blank line after the header and every line should be capitalized. The footer can contain breaking changes and issue references.',
  '',
  '## Header',
  '',
  'The header is the most important part of the commit message. It should be a single line that summarizes the change. The type must be one of the following: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. The scope is optional and should be a noun describing the area of the codebase that the change affects. The subject should be a short, imperative-tense description of the change.',
  '',
  '## Body',
  '',
  'The body is optional, but it is highly recommended. It should provide more context about the change, including the motivation and the approach. Use the imperative, present tense: "change" not "changed" nor "changes". The body should include the motivation for the change and contrast this with previous behavior. Capitalized at the beginning.',
  '',
  '## Footer',
  '',
  'The footer should contain any information about Breaking Changes and is also the place to reference GitHub issues that this commit closes.',
  'Breaking Changes should start with the word BREAKING CHANGE: with a space or two newlines. The rest of the commit message is then used for this. Capitalized at the beginning.',
  '',
  'Diff:',
  '```',
  '@{{diff}}',
  '```',
];

export class GenerateCommitMessageTool extends BaseTool<undefined, ToolResult> {
  static readonly Name = 'generate_commit_message';
  private readonly client: GeminiClient;

  constructor(config: Config) {
    super(
      GenerateCommitMessageTool.Name,
      'Generate Commit Message',
      'Generate a commit message from the git changes in the current project directory.',
      {
        properties: {},
        required: [],
        type: 'object',
      },
    );
    this.client = config.getGeminiClient();
  }

  validateToolParams(_params: undefined): string | null {
    return null;
  }

  getDescription(_params: undefined): string {
    return 'Generate a commit message for the current changes.';
  }

  async execute(_params: undefined, signal: AbortSignal): Promise<ToolResult> {
    console.debug('[GenerateCommitMessage] Tool execution started');
    
    return new Promise((resolve) => {
      // First try to get staged changes
      console.debug('[GenerateCommitMessage] Checking for staged changes...');
      const stagedChild = spawn('git', ['diff', '--cached'], { signal });
      let stagedStdout = '';
      let stagedStderr = '';

      stagedChild.stdout.on('data', (data) => {
        stagedStdout += data.toString();
        console.debug('[GenerateCommitMessage] Staged stdout data received:', data.toString().length, 'bytes');
      });

      stagedChild.stderr.on('data', (data) => {
        stagedStderr += data.toString();
        console.debug('[GenerateCommitMessage] Staged stderr data received:', data.toString());
      });

      stagedChild.on('close', async (stagedExitCode) => {
        console.debug('[GenerateCommitMessage] Staged git diff completed with exit code:', stagedExitCode);
        
        if (stagedExitCode !== 0) {
          console.debug('[GenerateCommitMessage] Staged git diff failed, stderr:', stagedStderr);
          resolve({
            llmContent: `Error getting git diff: ${stagedStderr}`,
            returnDisplay: `Error getting git diff: ${stagedStderr}`,
          });
          return;
        }

        const stagedDiff = stagedStdout.trim();
        console.debug('[GenerateCommitMessage] Staged diff length:', stagedDiff.length);

        // If we have staged changes, use them
        if (stagedDiff) {
          console.debug('[GenerateCommitMessage] Found staged changes, generating commit message...');
          await this.generateCommitFromDiff(stagedDiff, signal, resolve);
          return;
        }

        // Otherwise, try unstaged changes
        console.debug('[GenerateCommitMessage] No staged changes found, checking unstaged changes...');
        const unstagedChild = spawn('git', ['diff'], { signal });
        let unstagedStdout = '';
        let unstagedStderr = '';

        unstagedChild.stdout.on('data', (data) => {
          unstagedStdout += data.toString();
          console.debug('[GenerateCommitMessage] Unstaged stdout data received:', data.toString().length, 'bytes');
        });

        unstagedChild.stderr.on('data', (data) => {
          unstagedStderr += data.toString();
          console.debug('[GenerateCommitMessage] Unstaged stderr data received:', data.toString());
        });

        unstagedChild.on('close', async (unstagedExitCode) => {
          console.debug('[GenerateCommitMessage] Unstaged git diff completed with exit code:', unstagedExitCode);
          
          if (unstagedExitCode !== 0) {
            console.debug('[GenerateCommitMessage] Unstaged git diff failed, stderr:', unstagedStderr);
            resolve({
              llmContent: `Error getting git diff: ${unstagedStderr}`,
              returnDisplay: `Error getting git diff: ${unstagedStderr}`,
            });
            return;
          }

          const unstagedDiff = unstagedStdout.trim();
          console.debug('[GenerateCommitMessage] Unstaged diff length:', unstagedDiff.length);

          if (!unstagedDiff) {
            console.debug('[GenerateCommitMessage] No unstaged changes found either');
            resolve({
              llmContent: 'No changes detected in the current workspace.',
              returnDisplay: 'No changes detected in the current workspace.',
            });
            return;
          }

          console.debug('[GenerateCommitMessage] Found unstaged changes, generating commit message...');
          await this.generateCommitFromDiff(unstagedDiff, signal, resolve);
        });

        unstagedChild.on('error', (err) => {
          console.debug('[GenerateCommitMessage] Unstaged git diff process error:', err.message);
          resolve({
            llmContent: `Failed to start git diff process: ${err.message}`,
            returnDisplay: `Failed to start git diff process: ${err.message}`,
          });
        });
      });

      stagedChild.on('error', (err) => {
        console.debug('[GenerateCommitMessage] Staged git diff process error:', err.message);
        resolve({
          llmContent: `Failed to start git diff process: ${err.message}`,
          returnDisplay: `Failed to start git diff process: ${err.message}`,
        });
      });
    });
  }

  private async generateCommitFromDiff(
    diff: string,
    signal: AbortSignal,
    resolve: (value: ToolResult) => void,
  ): Promise<void> {
    console.debug('[GenerateCommitMessage] Starting commit message generation...');
    console.debug('[GenerateCommitMessage] Diff preview (first 200 chars):', diff.substring(0, 200) + (diff.length > 200 ? '...' : ''));
    
    const prompt = COMMIT_MESSAGE_PROMPT_LINES.join('\n').replace(
      /@\{\{diff\}\}/g,
      diff,
    );
    console.debug('[GenerateCommitMessage] Prompt length:', prompt.length);
    console.debug('[GenerateCommitMessage] Calling Gemini API...');
    
    try {
      const response = await this.client.generateContent(
        [{ role: 'user', parts: [{ text: prompt }] }],
        {},
        signal,
      );
      console.debug('[GenerateCommitMessage] Gemini API response received');
      
      const generatedText = getResponseText(response) ?? '';
      console.debug('[GenerateCommitMessage] Generated text length:', generatedText.length);
      console.debug('[GenerateCommitMessage] Generated text preview:', generatedText.substring(0, 100) + (generatedText.length > 100 ? '...' : ''));

      resolve({
        llmContent: generatedText,
        returnDisplay: generatedText,
      });
    } catch (error) {
      console.debug('[GenerateCommitMessage] Error during Gemini API call:', error);
      resolve({
        llmContent: `Error generating commit message: ${error}`,
        returnDisplay: `Error generating commit message: ${error}`,
      });
    }
  }
}
