/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { BaseTool, ToolResult } from './tools.js';
import { Config, ConfigParameters } from '../config/config.js';
import {
  SubAgentScope,
  SubagentTerminateMode,
  ContextState,
} from '../core/subagent.js';
import { LSTool } from './ls.js';
import { GrepTool } from './grep.js';
import { EditTool } from './edit.js';
import { ReadFileTool } from './read-file.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
/**
 * Parameters for the CleanDocstring tool
 */
export interface CleanDocstringToolParams {
  /**
   * The absolute path to the directory to list
   */
  path: string;
}

/**
 * Implementation of the CleanDocstring tool logic
 */
export class CleanDocstringTool extends BaseTool<
  CleanDocstringToolParams,
  ToolResult
> {
  static readonly Name = 'clean_docstrings';

  /**
   * Creates a new instance of the CleanDocstringTool.
   * @param rootDirectory Root directory to ground this tool in. All operations will be restricted to this directory.
   * @param config Configuration object.
   */
  constructor(
    private rootDirectory: string,
    private config: Config,
  ) {
    super(
      CleanDocstringTool.Name,
      'CleanDocstring',
      'Given a file, clean up the docstrings for it. Ensure that each function has a valid docstring.',
      {
        properties: {
          path: {
            description: 'This is the path to the file to do the cleanup on.',
            type: 'string',
          },
        },
        required: ['path'],
        type: 'object',
      },
    );

    // Set the root directory
    this.rootDirectory = path.resolve(rootDirectory);
  }

  /**
   * Executes the clean docstring operation using a subagent and orchestrator.
   * @param params Parameters for the clean docstring operation.
   * @param _signal AbortSignal (not used).
   * @returns A ToolResult object.  Returns an error object if the operation fails.
   */
  async execute(
    params: CleanDocstringToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    // Create a subagent, and invoke it with these params and give it access to the specific tools.
    const configParams: ConfigParameters = {
      sessionId: 'smarttool-cleandocstring-session',
      targetDir: '.',
      debugMode: false,
      cwd: process.cwd(),
      model: DEFAULT_GEMINI_FLASH_MODEL,
    };

    const subAgentConfig = new Config(configParams);
    const authType = this.config.getContentGeneratorConfig()?.authType;
    if (!authType) {
      return {
        llmContent:
          'Error: Parent tool is not properly authenticated. Cannot create sub-agent.',
        returnDisplay:
          'Error: Parent tool is not properly authenticated. Cannot create sub-agent.',
      };
    }
    await subAgentConfig.refreshAuth(authType);

    const promptConfig = {
      plan: `Your job is to read the file located at ${params.path} and edit it to make sure that it has full coverage of proper docstrings for the language. 

// Step-by-Step Workflow:
1.  **Load the File:** Use the ${ReadFileTool.name} to load the source code from ${params.path}.
2.  **Identify Language & Conventions:** Analyze the file content or extension to determine the programming language. State the language and the docstring convention you will use (e.g., "This is a Python file. I will use Google Style docstrings.").
3.  **Locate Functions:** Systematically scan the code and create a list of all function definitions.
4.  **Analyze and Edit (One Function at a Time):** For each function in your list, perform the following micro-workflow:
    a. **Check for Existing Docstring:** Look for a docstring immediately following the function signature.
    b. **Analyze Quality:** Evaluate the existing docstring (if any) against the "Definition of a High-Quality Docstring" checklist. Does it accurately reflect the function's parameters and return value? Is it formatted correctly?
    c. **Determine Action:**
        * **If the docstring is perfect:** Do nothing and move to the next function.
        * **If the docstring is missing or incomplete/incorrect:** Generate a new, high-quality docstring.
    d. **Execute Edit:** If an update is needed, formulate a precise edit to insert or replace the docstring for **only that single function**. Do not modify any other part of the file.


Rules for great docstrings:
* Docstrings should include a description of what the function does
* Docstrings should ensure that it properly describes input / return parameters

Important notes about your task:
* Do not try to edit the whole file at once. Try to make smaller edits so you don't accidentally make a mistake. It's ok to make an edit, clear your history, and re-read the file in again. that's a good thing.
* Be careful not to edit any part of the file that would cause errors. Make sure you do the right replacement functions to ensure the functions are correct, etc etc.
* Be careful not to duplicate any existing docstrings. If there's an existing docstring, you should review it, or edit it.
* Avoid re-writing an existing docstring, unless it is incorrect, or out of date, or non-existent. 
* Remember, a Docstring isn't just any random string, it's a SPECIFIC comment that's attached to a function that describes the arguments and returns.
* Do not edit any other part of the file, unrelated to the docstring.
* Your job is to JUST update the docstrings - Do not change any code, do not change inline comments. 
`,
      goals:
        '* Ensure that the target file has correct docstrings for all functions',
      outputs: {
        summary: 'a small list of the edits you made to the target file.',
      },
      tools: [ReadFileTool.Name, EditTool.Name, LSTool.Name, GrepTool.Name],
    };

    const modelConfig = {
      model: DEFAULT_GEMINI_FLASH_MODEL,
      temp: 0.2,
      top_p: 0.95,
    };

    const runConfig = {
      max_time_minutes: 2,
    };

    const context = new ContextState();

    const orchestrator = new SubAgentScope(
      subAgentConfig,
      promptConfig,
      modelConfig,
      runConfig,
    );

    try {
      await orchestrator.runNonInteractive(context);

      if (orchestrator.output.terminate_reason === SubagentTerminateMode.GOAL) {
        return {
          llmContent: 'Docstrings updated successfully',
          returnDisplay: 'Docstrings updated successfully',
        };
      }
    } catch (error) {
      console.error('Orchestrator run failed:', error);
    }
    return {
      llmContent: `Error: An error occurred while trying to fix up the docstrings for ${params.path}`,
      returnDisplay: `Error: An error occurred while trying to fix up the docstrings for ${params.path}`,
    };
  }
}
