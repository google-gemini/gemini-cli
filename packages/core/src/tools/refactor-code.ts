/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as ts from 'typescript';
import * as Diff from 'diff';
import { Logger } from '../core/logger.js';
import { promises as fsPromises } from 'fs';
import { BaseTool, ToolResult } from './tools.js';
import { getErrorMessage } from '../utils/errors.js';

interface RefactorCodeParams {
  filePath: string;
  refactoringType: 'rename-symbol'; // Extend with more types later
  oldName: string;
  newName: string;
}

export class RefactorTool extends BaseTool<RefactorCodeParams, ToolResult> {
  static readonly Name: string = 'refactor-code';

  constructor() {
    const parameterSchema: Record<string, unknown> = {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'The path to the file to refactor.',
        },
        refactoringType: {
          type: 'string',
          enum: ['rename-symbol'],
          description: 'The type of refactoring to perform.',
        },
        oldName: {
          type: 'string',
          description: 'The old name of the symbol.',
        },
        newName: {
          type: 'string',
          description: 'The new name of the symbol.',
        },
      },
      required: ['filePath', 'refactoringType', 'oldName', 'newName'],
    };

    super(
      RefactorTool.Name,
      'Refactor Code',
      'Refactors code by renaming symbols in a file.',
      parameterSchema,
    );
  }

  validateToolParams(params: RefactorCodeParams): string | null {
    if (!params.filePath) {
      return 'The "filePath" parameter is required.';
    }
    if (!params.refactoringType) {
      return 'The "refactoringType" parameter is required.';
    }
    if (params.refactoringType !== 'rename-symbol') {
      return 'Only "rename-symbol" refactoring type is supported.';
    }
    if (!params.oldName) {
      return 'The "oldName" parameter is required.';
    }
    if (!params.newName) {
      return 'The "newName" parameter is required.';
    }
    return null;
  }

  getDescription(params: RefactorCodeParams): string {
    return `Refactoring symbol "${params.oldName}" to "${params.newName}" in file "${params.filePath}".`;
  }

  async execute(params: RefactorCodeParams): Promise<ToolResult> {
    const logger = new Logger('refactor-tool-session');
    logger.info(
      `// Initiating refactoring: ${params.refactoringType} in ${params.filePath}`,
    );

    try {
      const fileContent = await fsPromises.readFile(params.filePath, 'utf8');
      const sourceFile = ts.createSourceFile(
        params.filePath,
        fileContent,
        ts.ScriptTarget.Latest,
        true, // Set parent pointers
      );

      let newContent = fileContent;
      let replacementsMade = 0;

      // Simple visitor to find and replace symbol names
      const visitor = (node: ts.Node) => {
        if (ts.isIdentifier(node) && node.text === params.oldName) {
          const start = node.getStart(sourceFile);
          const end = node.getEnd();
          newContent =
            newContent.substring(0, start) +
            params.newName +
            newContent.substring(end);
          replacementsMade++;
        }
        ts.forEachChild(node, visitor);
      };

      ts.forEachChild(sourceFile, visitor);

      if (replacementsMade === 0) {
        logger.warn(
          `// No occurrences of '${params.oldName}' found in '${params.filePath}'.`,
        );
        return {
          llmContent: `No changes made. No occurrences of '${params.oldName}' found.`,
          returnDisplay: `## Refactoring Result\n\nNo occurrences of '${params.oldName}' found in '${params.filePath}'.`,
        };
      }

      const diff = Diff.createPatch(
        params.filePath,
        fileContent,
        newContent,
        'Original',
        'Refactored',
      );

      logger.info(
        `// Refactoring complete. Generated diff for ${replacementsMade} replacements.`,
      );
      return {
        llmContent: diff,
        returnDisplay: `## Refactoring Result\n\nSuccessfully refactored ${replacementsMade} occurrences.\n\`\`\`diff\n${diff}\n\`\`\``,
      };
    } catch (error: unknown) {
      const errorMessage = `Refactoring failed: ${getErrorMessage(error)}`;
      logger.error(`// ${errorMessage}`);
      return {
        llmContent: errorMessage,
        returnDisplay: `## Refactoring Error\n\n${errorMessage}`,
      };
    }
  }
}

