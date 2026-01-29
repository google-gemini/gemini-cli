/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
  type ToolCallConfirmationDetails,
} from './tools.js';
import { GET_INTERNAL_DOCS_TOOL_NAME } from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import { ToolErrorType } from './tool-error.js';

/**
 * Parameters for the GetInternalDocs tool.
 */
export interface GetInternalDocsParams {
  /**
   * The relative path to a specific documentation file (e.g., 'cli/commands.md').
   * If omitted, the tool will return a list of all available documentation paths.
   */
  path?: string;
}

/**
 * Helper to find the absolute path to the documentation directory.
 */
async function getDocsRoot(): Promise<string> {
  const currentFile = fileURLToPath(import.meta.url);
  let searchDir = path.dirname(currentFile);

  const isDocsDir = async (dir: string) => {
    try {
      const stats = await fs.stat(dir);
      if (stats.isDirectory()) {
        const marker = path.join(dir, 'sidebar.json');
        await fs.access(marker);
        return true;
      }
    } catch {
      // Not a valid docs directory
    }
    return false;
  };

  while (true) {
    const candidate = path.join(searchDir, 'docs');
    if (await isDocsDir(candidate)) {
      return candidate;
    }

    const parent = path.dirname(searchDir);
    if (parent === searchDir) {
      break;
    }
    searchDir = parent;
  }

  throw new Error('Could not find Gemini CLI documentation directory.');
}

class GetInternalDocsInvocation extends BaseToolInvocation<
  GetInternalDocsParams,
  ToolResult
> {
  constructor(
    params: GetInternalDocsParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return false;
  }

  getDescription(): string {
    if (this.params.path) {
      return `Reading internal documentation: ${this.params.path}`;
    }
    return 'Listing all available internal documentation.';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const docsRoot = await getDocsRoot();

      if (!this.params.path) {
        // List all .md files recursively
        const files = await glob('**/*.md', { cwd: docsRoot, posix: true });
        files.sort();

        const fileList = files.map((f) => `- ${f}`).join('\n');
        const resultContent = `Available Gemini CLI documentation files:\n\n${fileList}`;

        return {
          llmContent: resultContent,
          returnDisplay: `Found ${files.length} documentation files.`,
        };
      }

      // Read a specific file
      // Security: Prevent path traversal by resolving and verifying it stays within docsRoot
      const resolvedPath = path.resolve(docsRoot, this.params.path);
      if (!resolvedPath.startsWith(docsRoot)) {
        throw new Error(
          'Access denied: Requested path is outside the documentation directory.',
        );
      }

      const content = await fs.readFile(resolvedPath, 'utf8');

      return {
        llmContent: content,
        returnDisplay: `Successfully read documentation: ${this.params.path}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error accessing internal documentation: ${errorMessage}`,
        returnDisplay: `Failed to access documentation: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

/**
 * A tool that provides access to Gemini CLI's internal documentation.
 * If no path is provided, it returns a list of all available documentation files.
 * If a path is provided, it returns the content of that specific file.
 */
export class GetInternalDocsTool extends BaseDeclarativeTool<
  GetInternalDocsParams,
  ToolResult
> {
  static readonly Name = GET_INTERNAL_DOCS_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      GetInternalDocsTool.Name,
      'GetInternalDocs',
      'Returns the content of Gemini CLI internal documentation files. If no path is provided, returns a list of all available documentation paths.',
      Kind.Think,
      {
        type: 'object',
        properties: {
          path: {
            description:
              "The relative path to the documentation file (e.g., 'cli/commands.md'). If omitted, lists all available documentation.",
            type: 'string',
          },
        },
      },
      messageBus,
      /* isOutputMarkdown */ true,
      /* canUpdateOutput */ false,
    );
  }

  protected createInvocation(
    params: GetInternalDocsParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<GetInternalDocsParams, ToolResult> {
    return new GetInternalDocsInvocation(
      params,
      messageBus,
      _toolName ?? GetInternalDocsTool.Name,
      _toolDisplayName,
    );
  }
}
