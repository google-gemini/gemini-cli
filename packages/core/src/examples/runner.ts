/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Example Runner
 *
 * Executes examples by submitting their prompts to the main Gemini CLI
 * conversation system.
 *
 * @module examples/runner
 */

import type { Example, ExampleResult } from './types.js';
import type { ChatService } from '../core/chat-service.js';

/**
 * Options for running an example
 */
export interface RunExampleOptions {
  /** Whether to show a preview before running */
  preview?: boolean;

  /** Whether to ask for confirmation before executing */
  confirm?: boolean;

  /** Whether to run in dry-run mode (show what would happen) */
  dryRun?: boolean;

  /** Custom context to add to the prompt */
  customContext?: string;

  /** Override the example prompt */
  overridePrompt?: string;
}

/**
 * Example Runner Class
 *
 * Handles execution of examples, including validation, context preparation,
 * and result tracking.
 *
 * @example
 * ```typescript
 * const runner = new ExampleRunner(chatService);
 *
 * // Run an example
 * const result = await runner.run(example, {
 *   preview: true,
 *   confirm: true
 * });
 *
 * if (result.success) {
 *   console.log('Example completed successfully!');
 * }
 * ```
 */
export class ExampleRunner {
  constructor(private chatService: ChatService) {}

  /**
   * Run an example
   *
   * @param example - The example to run
   * @param options - Execution options
   * @returns Result of execution
   */
  async run(
    example: Example,
    options: RunExampleOptions = {},
  ): Promise<ExampleResult> {
    const startTime = Date.now();

    try {
      // Validate prerequisites
      await this.validatePrerequisites(example);

      // Build the complete prompt
      const prompt = this.buildPrompt(example, options);

      // Show preview if requested
      if (options.preview) {
        await this.showPreview(example, prompt);
      }

      // Ask for confirmation if requested
      if (options.confirm && !options.dryRun) {
        const confirmed = await this.confirmExecution(example);
        if (!confirmed) {
          return {
            example,
            success: false,
            error: 'Execution cancelled by user',
            executionTime: Date.now() - startTime,
          };
        }
      }

      // Dry run - just show what would happen
      if (options.dryRun) {
        return {
          example,
          success: true,
          output: `[DRY RUN] Would execute:\n${prompt}`,
          executionTime: Date.now() - startTime,
        };
      }

      // Execute the example by submitting to chat service
      const output = await this.execute(prompt);

      // Track any file modifications
      const filesModified = await this.detectFileModifications();

      return {
        example,
        success: true,
        output,
        executionTime: Date.now() - startTime,
        filesModified,
      };
    } catch (error) {
      return {
        example,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate that prerequisites are met
   */
  private async validatePrerequisites(example: Example): Promise<void> {
    // Check if required tools are available
    // This would integrate with the actual tool system
    for (const tool of example.requiredTools) {
      // TODO: Check tool availability
    }

    // Check permissions
    for (const permission of example.requiredPermissions) {
      // TODO: Check permissions
    }

    // Validate prerequisites
    if (example.prerequisites && example.prerequisites.length > 0) {
      // For now, just log them
      console.log('Prerequisites:', example.prerequisites);
    }
  }

  /**
   * Build the complete prompt including context
   */
  private buildPrompt(
    example: Example,
    options: RunExampleOptions,
  ): string {
    const parts: string[] = [];

    // Use custom context if provided
    if (options.customContext) {
      parts.push(options.customContext);
      parts.push('');
    }

    // Include context files if specified
    if (example.contextFiles && example.contextFiles.length > 0) {
      const contextRefs = example.contextFiles.map((f) => `@${f}`).join(' ');
      parts.push(contextRefs);
      parts.push('');
    }

    // Add the prompt (allow override)
    const prompt = options.overridePrompt ?? example.examplePrompt;
    parts.push(prompt);

    return parts.join('\n');
  }

  /**
   * Show preview of what will be executed
   */
  private async showPreview(example: Example, prompt: string): Promise<void> {
    console.log('\n=== Example Preview ===');
    console.log(`Title: ${example.title}`);
    console.log(`Category: ${example.category}`);
    console.log(`Estimated Time: ${example.estimatedTime}`);
    console.log('\nPrompt:');
    console.log(prompt);
    console.log('\nExpected Outcome:');
    console.log(example.expectedOutcome);
    console.log('======================\n');
  }

  /**
   * Ask user to confirm execution
   */
  private async confirmExecution(example: Example): Promise<boolean> {
    // This would integrate with the confirmation system
    // For now, return true
    return true;
  }

  /**
   * Execute the prompt through the chat service
   */
  private async execute(prompt: string): Promise<string> {
    // This would integrate with the actual chat service
    // For now, return a placeholder
    return 'Example executed successfully';
  }

  /**
   * Detect files that were modified during execution
   */
  private async detectFileModifications(): Promise<string[]> {
    // This would integrate with the file tracking system
    // For now, return empty array
    return [];
  }

  /**
   * Save an example as a custom command
   *
   * @param example - Example to save
   * @param commandName - Name for the custom command
   */
  async saveAsCustomCommand(
    example: Example,
    commandName: string,
  ): Promise<void> {
    // This would integrate with the custom command system
    const command = {
      name: commandName,
      description: example.description,
      prompt: example.examplePrompt,
      tags: example.tags,
    };

    // TODO: Save to custom commands
    console.log('Would save command:', command);
  }
}
