/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolConfirmationOutcome,
  type ToolEditConfirmationDetails,
  type ToolResult,
} from './tools.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import * as Diff from 'diff';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { tildeifyPath } from '../utils/paths.js';
import type {
  ModifiableDeclarativeTool,
  ModifyContext,
} from './modifiable-tool.js';
import { ToolErrorType } from './tool-error.js';
import { MEMORY_TOOL_NAME } from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { MEMORY_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

export const DEFAULT_CONTEXT_FILENAME = 'GEMINI.md';
export const MEMORY_SECTION_HEADER = '## Gemini Added Memories';

// This variable will hold the currently configured filename for GEMINI.md context files.
// It defaults to DEFAULT_CONTEXT_FILENAME but can be overridden by setGeminiMdFilename.
let currentGeminiMdFilename: string | string[] = DEFAULT_CONTEXT_FILENAME;

export function setGeminiMdFilename(newFilename: string | string[]): void {
  if (Array.isArray(newFilename)) {
    if (newFilename.length > 0) {
      currentGeminiMdFilename = newFilename.map((name) => name.trim());
    }
  } else if (newFilename && newFilename.trim() !== '') {
    currentGeminiMdFilename = newFilename.trim();
  }
}

export function getCurrentGeminiMdFilename(): string {
  if (Array.isArray(currentGeminiMdFilename)) {
    return currentGeminiMdFilename[0];
  }
  return currentGeminiMdFilename;
}

export function getAllGeminiMdFilenames(): string[] {
  if (Array.isArray(currentGeminiMdFilename)) {
    return currentGeminiMdFilename;
  }
  return [currentGeminiMdFilename];
}

interface SaveMemoryParams {
  fact: string;
  modified_by_user?: boolean;
  modified_content?: string;
}

export function getGlobalMemoryFilePath(): string {
  return path.join(Storage.getGlobalGeminiDir(), getCurrentGeminiMdFilename());
}

/**
 * Ensures proper newline separation before appending content.
 */
function ensureNewlineSeparation(currentContent: string): string {
  if (currentContent.length === 0) return '';
  if (currentContent.endsWith('\n\n') || currentContent.endsWith('\r\n\r\n'))
    return '';
  if (currentContent.endsWith('\n') || currentContent.endsWith('\r\n'))
    return '\n';
  return '\n\n';
}

/**
 * Reads the current content of the memory file
 */
async function readMemoryFileContent(): Promise<string> {
  try {
    return await fs.readFile(getGlobalMemoryFilePath(), 'utf-8');
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const error = err as Error & { code?: string };
    if (!(error instanceof Error) || error.code !== 'ENOENT') throw err;
    return '';
  }
}

/**
 * Computes the new content that would result from adding a memory entry
 */
function computeNewContent(currentContent: string, fact: string): string {
  // Sanitize to prevent markdown injection by collapsing to a single line.
  let processedText = fact.replace(/[\r\n]/g, ' ').trim();
  processedText = processedText.replace(/^(-+\s*)+/, '').trim();
  const newMemoryItem = `- ${processedText}`;

  const headerIndex = currentContent.indexOf(MEMORY_SECTION_HEADER);

  if (headerIndex === -1) {
    // Header not found, append header and then the entry
    const separator = ensureNewlineSeparation(currentContent);
    return (
      currentContent +
      `${separator}${MEMORY_SECTION_HEADER}\n${newMemoryItem}\n`
    );
  } else {
    // Header found, find where to insert the new memory entry
    const startOfSectionContent = headerIndex + MEMORY_SECTION_HEADER.length;
    let endOfSectionIndex = currentContent.indexOf(
      '\n## ',
      startOfSectionContent,
    );
    if (endOfSectionIndex === -1) {
      endOfSectionIndex = currentContent.length; // End of file
    }

    const beforeSectionMarker = currentContent
      .substring(0, startOfSectionContent)
      .trimEnd();
    let sectionContent = currentContent
      .substring(startOfSectionContent, endOfSectionIndex)
      .trimEnd();
    const afterSectionMarker = currentContent.substring(endOfSectionIndex);

    sectionContent += `\n${newMemoryItem}`;
    return (
      `${beforeSectionMarker}\n${sectionContent.trimStart()}\n${afterSectionMarker}`.trimEnd() +
      '\n'
    );
  }
}

class MemoryToolInvocation extends BaseToolInvocation<
  SaveMemoryParams,
  ToolResult
> {
  private static readonly allowlist: Set<string> = new Set();
  private proposedNewContent: string | undefined;
  private originalContent: string | undefined;

  constructor(
    params: SaveMemoryParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    super(params, messageBus, toolName, displayName);
  }

  getDescription(): string {
    const memoryFilePath = getGlobalMemoryFilePath();
    return `in ${tildeifyPath(memoryFilePath)}`;
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolEditConfirmationDetails | false> {
    const memoryFilePath = getGlobalMemoryFilePath();
    const allowlistKey = memoryFilePath;

    if (MemoryToolInvocation.allowlist.has(allowlistKey)) {
      return false;
    }

    const currentContent = await readMemoryFileContent();
    this.originalContent = currentContent;
    const { fact, modified_by_user, modified_content } = this.params;

    // If an attacker injects modified_content, use it for the diff
    // to expose the attack to the user. Otherwise, compute from 'fact'.
    const contentForDiff =
      modified_by_user && modified_content !== undefined
        ? modified_content
        : computeNewContent(currentContent, fact);

    this.proposedNewContent = contentForDiff;

    const fileName = path.basename(memoryFilePath);
    const fileDiff = Diff.createPatch(
      fileName,
      currentContent,
      this.proposedNewContent,
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `Confirm Memory Save: ${tildeifyPath(memoryFilePath)}`,
      fileName: memoryFilePath,
      filePath: memoryFilePath,
      fileDiff,
      originalContent: currentContent,
      newContent: this.proposedNewContent,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          MemoryToolInvocation.allowlist.add(allowlistKey);
        }
        // Policy updates are now handled centrally by the scheduler
      },
    };
    return confirmationDetails;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { fact, modified_by_user, modified_content } = this.params;

    try {
      let contentToWrite: string;
      let successMessage: string;

      // Sanitize the fact for use in the success message, matching the sanitization
      // that happened inside computeNewContent.
      const sanitizedFact = fact.replace(/[\r\n]/g, ' ').trim();
      const currentContent = await readMemoryFileContent();

      const hasChanged =
        this.originalContent !== undefined &&
        currentContent !== this.originalContent;

      // Handle the unrecoverable conflict first.
      if (hasChanged && modified_by_user && modified_content !== undefined) {
        const errorMessage =
          'Conflict: GEMINI.md was modified externally while you were editing the prompt. Please review and retry to avoid data loss.';
        return {
          llmContent: JSON.stringify({
            success: false,
            error: errorMessage,
          }),
          returnDisplay: errorMessage,
          error: {
            message: errorMessage,
            type: ToolErrorType.MEMORY_TOOL_EXECUTION_ERROR,
          },
        };
      }

      // Determine the content to write and the success message for the remaining cases.
      if (modified_by_user && modified_content !== undefined) {
        // Case: User provided custom modifications, and no external conflict occurred.
        contentToWrite = modified_content;
        successMessage = `Okay, I've updated the memory file with your modifications.`;
      } else {
        // Case: No user modifications. Handle external changes or use cached content.
        if (hasChanged) {
          // The file changed externally, so we recompute the content from the new state.
          contentToWrite = computeNewContent(currentContent, fact);
          successMessage = `Okay, I've remembered that: "${sanitizedFact}". Note: The memory file was modified externally and your change was merged.`;
        } else {
          // The file has not changed, so we can safely use the cached proposed content.
          if (this.proposedNewContent === undefined) {
            // Fallback for flows without a confirmation step (e.g., --auto-confirm).
            this.proposedNewContent = computeNewContent(currentContent, fact);
          }
          contentToWrite = this.proposedNewContent;
          successMessage = `Okay, I've remembered that: "${sanitizedFact}"`;
        }
      }

      await fs.mkdir(path.dirname(getGlobalMemoryFilePath()), {
        recursive: true,
      });
      await fs.writeFile(getGlobalMemoryFilePath(), contentToWrite, 'utf-8');

      return {
        llmContent: JSON.stringify({
          success: true,
          message: successMessage,
        }),
        returnDisplay: successMessage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Failed to save memory. Detail: ${errorMessage}`,
        }),
        returnDisplay: `Error saving memory: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.MEMORY_TOOL_EXECUTION_ERROR,
        },
      };
    }
  }
}

export class MemoryTool
  extends BaseDeclarativeTool<SaveMemoryParams, ToolResult>
  implements ModifiableDeclarativeTool<SaveMemoryParams>
{
  static readonly Name = MEMORY_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      MemoryTool.Name,
      'SaveMemory',
      MEMORY_DEFINITION.base.description!,
      Kind.Think,
      MEMORY_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
  }

  protected override validateToolParamValues(
    params: SaveMemoryParams,
  ): string | null {
    if (params.fact.trim() === '') {
      return 'Parameter "fact" must be a non-empty string.';
    }

    return null;
  }

  protected createInvocation(
    params: SaveMemoryParams,
    messageBus: MessageBus,
    toolName?: string,
    displayName?: string,
  ) {
    return new MemoryToolInvocation(
      params,
      messageBus,
      toolName ?? this.name,
      displayName ?? this.displayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(MEMORY_DEFINITION, modelId);
  }

  getModifyContext(_abortSignal: AbortSignal): ModifyContext<SaveMemoryParams> {
    return {
      getFilePath: (_params: SaveMemoryParams) => getGlobalMemoryFilePath(),
      getCurrentContent: async (_params: SaveMemoryParams): Promise<string> =>
        readMemoryFileContent(),
      getProposedContent: async (params: SaveMemoryParams): Promise<string> => {
        const currentContent = await readMemoryFileContent();
        const { fact, modified_by_user, modified_content } = params;
        // Ensure the editor is populated with the same content
        // that the confirmation diff would show.
        return modified_by_user && modified_content !== undefined
          ? modified_content
          : computeNewContent(currentContent, fact);
      },
      createUpdatedParams: (
        _oldContent: string,
        modifiedProposedContent: string,
        originalParams: SaveMemoryParams,
      ): SaveMemoryParams => ({
        ...originalParams,
        modified_by_user: true,
        modified_content: modifiedProposedContent,
      }),
    };
  }
}
