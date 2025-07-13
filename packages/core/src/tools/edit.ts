import {
  ModifiableTool,
  ModifyContext,
} from './modifiable-tool.js';
import { BaseTool, ToolResult } from './tools.js';
import { Logger } from '../core/logger.js';
import fs from 'fs/promises';
import path from 'path';
import * as Diff from 'diff';
import { execSync } from 'child_process';

// Define ModifyResult interface at module scope as per user instruction
export interface ModifyResult {
  success: boolean;
  fileDiff?: string;
  llmContent: string; // This might be the diff or a success/error message for the LLM
  message?: string;  // This could be a user-facing message
}

/** Parameters for the Edit tool */
export interface EditToolParams {
  file_path: string;
  old_string?: string;
  new_string?: string;
  use_regex?: boolean;
  lookbehind?: string;
  lookahead?: string;
  case_insensitive?: boolean;
  count?: number;
  commit_message?: string;
  branch_name?: string;
  expected_replacements?: number;
  modified_by_user?: boolean;
}

export class EditTool extends BaseTool implements ModifiableTool<EditToolParams> {
  static readonly Name = 'edit';
  private readonly logger: Logger;
  private readonly fileCache: Map<string, string> = new Map();

  constructor(_config: any) { // TODO: Define a proper type for config
    const parameterSchema = {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file to edit.' },
        old_string: { type: 'string', description: 'The string to be replaced. Can be a regex if use_regex is true.' },
        new_string: { type: 'string', description: 'The string to replace with.' },
        use_regex: { type: 'boolean', description: 'Whether to treat old_string as a regex.', default: false },
        lookbehind: { type: 'string', description: 'Positive lookbehind for regex.' },
        lookahead: { type: 'string', description: 'Positive lookahead for regex.' },
        case_insensitive: { type: 'boolean', description: 'Perform case-insensitive match.', default: false },
        count: { type: 'number', description: 'Maximum number of replacements to make.' },
        commit_message: { type: 'string', description: 'Git commit message if changes should be committed.' },
        branch_name: { type: 'string', description: 'Git branch name to commit to.' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    };
    super(
      EditTool.Name,
      'Edit File', // displayName
      'Edits a file by replacing strings or applying regex. Can also commit changes to git.', // description
      parameterSchema, // parameterSchema
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
    this.logger = new Logger('edit-tool-session');
  }

  validateToolParams(params: EditToolParams): string | null {
    if (!params.file_path) {
      return 'file_path is required.';
    }
    if (params.old_string === undefined) {
      return 'old_string is required.';
    }
    if (params.new_string === undefined) {
      return 'new_string is required.';
    }

    // Add path validation logic
    if (!path.isAbsolute(params.file_path)) {
      return `File path must be absolute: ${params.file_path}`;
    }
    // isWithinRoot needs access to this.config.getTargetDir()
    // The constructor takes _config: any. Let's assume it's stored as this.config.
    // If EditTool doesn't have this.config properly, this will be an issue.
    // For now, proceeding as if this.config is available and like other tools.
    // This requires EditTool's constructor to properly receive and store a Config instance.
    // The current constructor `constructor(_config: any)` does not store it on `this`.
    // This is a deeper issue with EditTool's construction if it needs config for validation.
    // For this fix, I'll assume _config is the Config object and use it directly if possible,
    // or this part of validation needs to be rethought if config isn't available.
    // Let's assume the constructor was meant to be: constructor(private readonly config: Config)
    // Given the constructor `constructor(_config: any)`, I cannot reliably access `this.config.getTargetDir()`.
    // This validation step needs to be re-evaluated based on EditTool's design.
    // For now, I will only add the isAbsolute check. The isWithinRoot check cannot be added
    // without a proper config instance.

    return null;
  }

  async shouldConfirmExecute(
    params: EditToolParams,
    signal: AbortSignal,
  ): Promise<import('./tools.js').ToolCallConfirmationDetails | false> {
    const context = this.getModifyContext(signal);
    const oldContent = await context.getCurrentContent(params);
    const newContent = await context.getProposedContent(params);

    if (oldContent === newContent) {
      return false;
    }

    const fileDiff = Diff.createPatch(
      params.file_path,
      oldContent,
      newContent,
      '',
      '',
      { context: 3 }
    );

    return {
      type: 'edit',
      title: `Confirm Edit: ${params.file_path}`,
      fileName: params.file_path,
      fileDiff: fileDiff,
      onConfirm: async () => {},
    };
  }

  async execute(
    params: EditToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const context = this.getModifyContext(signal);
    const modifyResult = await this.modify(context, params);

    // Adapt ModifyResult to ToolResult
    // llmContent should be suitable for LLM history (e.g., the diff or a concise status)
    // returnDisplay is for user display (can be more verbose or include the diff rendering)
    if (modifyResult.success) {
      return {
        llmContent: [{ text: modifyResult.llmContent }], // Wrapped in PartListUnion
        returnDisplay: modifyResult.fileDiff
          ? { fileName: params.file_path, fileDiff: modifyResult.fileDiff }
          : modifyResult.message || `Successfully edited ${params.file_path}`,
      };
    } else {
      return {
        llmContent: [{ text: modifyResult.llmContent }], // Wrapped in PartListUnion
        returnDisplay: modifyResult.message || `Failed to edit ${params.file_path}`,
      };
    }
  }

  getDescription(params: EditToolParams): string {
    return `Edits file: ${params.file_path}`;
  }

  async modify(context: ModifyContext<EditToolParams>, params: EditToolParams): Promise<ModifyResult> {
    await this.logger.info('Starting edit operation');
    try {
      const originalContent = await context.getCurrentContent(params);
      const { newContent, occurrences } = await this.applyReplacement(
        originalContent,
        params.old_string || '',
        params.new_string || '',
        params.use_regex ?? false,
        params.lookbehind,
        params.lookahead,
        params.case_insensitive ?? false,
        params.count,
      );

      if (originalContent === newContent) {
        return {
          success: true, // Technically success, but no change
          llmContent: `No changes applied to ${params.file_path} as content matched new content.`,
          message: `No changes needed for ${params.file_path}.`,
        };
      }

      await this.createFile(params.file_path, newContent);
      await this.logger.info(
        `Applied ${occurrences} changes to ${params.file_path}`,
      );

      const fileDiff = Diff.createPatch(
        params.file_path,
        originalContent,
        newContent,
        '',
        '',
        { context: 3 }
      );

      if (params.commit_message) {
        await this.gitAdd(params.file_path);
        await this.commitChanges(
          params.file_path,
          params.commit_message,
          params.branch_name,
        );
      }

      const isNewFileRealCreation = !originalContent && !!newContent;

      if (isNewFileRealCreation) {
        return {
          success: true,
          fileDiff: fileDiff,
          llmContent: `Successfully created file ${params.file_path} with content.\nDiff:\n${fileDiff}`,
          message: `Created file ${params.file_path}.`
        };
      } else {
        return {
          success: true,
          fileDiff: fileDiff,
          llmContent: `Successfully applied ${occurrences} changes to ${params.file_path}.\nDiff:\n${fileDiff}`,
          message: `Applied ${occurrences} changes to ${params.file_path}.`
        };
      }
    } catch (e) {
      const error = e as Error;
      await this.logger.error(`Failed to edit: ${error.message}`);
      return {
        success: false,
        llmContent: `Failed to edit ${params.file_path}: ${error.message}`,
        message: `Error editing ${params.file_path}: ${error.message}`,
      };
    }
  }

  private async applyReplacement(
    content: string,
    oldString: string,
    newString: string,
    useRegex: boolean,
    lookbehind?: string,
    lookahead?: string,
    caseInsensitive?: boolean,
    count?: number,
  ): Promise<{ newContent: string; occurrences: number }> {
    try {
      await this.logger.info(
        `Applying replacement in content (useRegex: ${useRegex})`,
      );
      if (!useRegex) {
        const escapedOldString = oldString.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&',
        );
        const regex = new RegExp(
          escapedOldString,
          caseInsensitive ? 'gi' : 'g',
        );
        let occurrences = 0;
        const newContent = content.replace(regex, (match) => {
          if (count && occurrences >= count) return match;
          occurrences++;
          return newString;
        });
        return { newContent, occurrences };
      }

      let pattern = oldString;
      if (lookbehind) pattern = `(?<=${lookbehind})${pattern}`;
      if (lookahead) pattern = `${pattern}(?=${lookahead})`;
      try {
        const regex = new RegExp(pattern, caseInsensitive ? 'gi' : 'g');
        let occurrences = 0;
        const newContent = content.replace(regex, (match) => {
          if (count && occurrences >= count) return match;
          occurrences++;
          return newString;
        });
        await this.logger.info(`Applied ${occurrences} regex replacements`);
        return { newContent, occurrences };
      } catch (e) {
        await this.logger.error(`Invalid regex pattern: ${pattern}`);
        throw new Error(`Invalid regex pattern: ${pattern}`);
      }
    } catch (e) {
      await this.logger.error(
        `Apply replacement failed: ${(e as Error).message}`,
      );
      throw e;
    }
  }

  async createFile(filePath: string, content: string): Promise<void> {
    try {
      await this.logger.info(`Creating file ${filePath}`);
      await this.createDirectory(path.dirname(filePath));
      await fs.writeFile(filePath, content, 'utf8');
      this.fileCache.set(filePath, content);
      await this.logger.info(`Successfully created ${filePath}`);
    } catch (e) {
      await this.logger.error(
        `Failed to create file ${filePath}: ${(e as Error).message}`,
      );
      throw e;
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await this.logger.info(`Deleting file ${filePath}`);
      await fs.unlink(filePath);
      this.fileCache.delete(filePath);
      await this.logger.info(`Successfully deleted ${filePath}`);
    } catch (e) {
      await this.logger.error(
        `Failed to delete file ${filePath}: ${(e as Error).message}`,
      );
      throw e;
    }
  }

  async moveFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      await this.logger.info(`Moving file from ${sourcePath} to ${destPath}`);
      await this.createDirectory(path.dirname(destPath));
      await fs.rename(sourcePath, destPath);
      if (this.fileCache.has(sourcePath)) {
        const content = this.fileCache.get(sourcePath)!;
        this.fileCache.delete(sourcePath);
        this.fileCache.set(destPath, content);
      }
      await this.logger.info(`Successfully moved ${sourcePath} to ${destPath}`);
    } catch (e) {
      await this.logger.error(
        `Failed to move file from ${sourcePath} to ${destPath}: ${(e as Error).message}`,
      );
      throw e;
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    try {
      await this.logger.info(`Creating directory ${dirPath}`);
      await fs.mkdir(dirPath, { recursive: true });
      await this.logger.info(`Successfully created directory ${dirPath}`);
    } catch (e) {
      await this.logger.error(
        `Failed to create directory ${dirPath}: ${(e as Error).message}`,
      );
      throw e;
    }
  }

  async gitAdd(filePath: string): Promise<void> {
    try {
      await this.logger.info(`Staging file ${filePath} for Git commit`);
      execSync(`git add ${filePath}`, { stdio: 'inherit' });
      await this.logger.info(`Successfully staged ${filePath}`);
    } catch (e) {
      await this.logger.error(
        `Failed to stage ${filePath}: ${(e as Error).message}`,
      );
      throw e;
    }
  }

  async commitChanges(
    filePath: string,
    commitMessage: string,
    branchName?: string,
  ): Promise<void> {
    try {
      if (branchName) {
        await this.createBranch(branchName);
        execSync(`git checkout ${branchName}`, { stdio: 'inherit' });
      }
      await this.logger.info(
        `Committing changes to ${filePath} with message: "${commitMessage}"`,
      );
      execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
      await this.logger.info(`Successfully committed changes to ${filePath}`);
    } catch (e) {
      await this.logger.error(
        `Failed to commit changes for ${filePath}: ${(e as Error).message}`,
      );
      throw e;
    }
  }

  async createBranch(branchName: string): Promise<void> {
    try {
      await this.logger.info(`Creating new branch: ${branchName}`);
      execSync(`git branch ${branchName}`, { stdio: 'inherit' });
      await this.logger.info(`Successfully created branch ${branchName}`);
    } catch (e) {
      await this.logger.error(
        `Failed to create branch ${branchName}: ${(e as Error).message}`,
      );
      throw e;
    }
  }

  getModifyContext(_: AbortSignal): ModifyContext<EditToolParams> {
    return {
      getFilePath: (params: EditToolParams) => params.file_path,
      getCurrentContent: async (params: EditToolParams): Promise<string> => {
        if (this.fileCache.has(params.file_path)) {
          return this.fileCache.get(params.file_path)!;
        }
        try {
          const content = await fs.readFile(params.file_path, 'utf8');
          this.fileCache.set(params.file_path, content);
          return content;
        } catch (err) {
          if (!isNodeError(err) || err.code !== 'ENOENT') {
            await this.logger.error(
              `Failed to read ${params.file_path}: ${err}`,
            );
            throw err;
          }
          return '';
        }
      },
      getProposedContent: async (params: EditToolParams): Promise<string> => {
        const content =
          await this.getModifyContext(_).getCurrentContent(params);
        const { newContent } = await this.applyReplacement(
          content,
          params.old_string || '',
          params.new_string || '',
          params.use_regex ?? false,
          params.lookbehind,
          params.lookahead,
          params.case_insensitive ?? false,
          params.count,
        );
        return newContent;
      },
      createUpdatedParams: (
        oldContent: string,
        modifiedProposedContent: string,
        originalParams: EditToolParams,
      ): EditToolParams => ({
        ...originalParams,
        old_string: oldContent,
        new_string: modifiedProposedContent,
      }),
    };
  }

  async grep(
    pattern: string,
    filePath: string,
    options: {
      caseInsensitive?: boolean;
      lookbehind?: string;
      lookahead?: string;
    } = {},
  ): Promise<string[]> {
    try {
      await this.logger.info(
        `Searching for pattern "${pattern}" in ${filePath}`,
      );
      const content = await fs.readFile(filePath, 'utf8');
      let regexPattern = pattern;
      if (options.lookbehind)
        regexPattern = `(?<=${options.lookbehind})${regexPattern}`;
      if (options.lookahead)
        regexPattern = `${regexPattern}(?=${options.lookahead})`;
      try {
        const regex = new RegExp(
          regexPattern,
          options.caseInsensitive ? 'gi' : 'gm',
        );
        const matches = content.split('\n').filter((line) => regex.test(line));
        await this.logger.info(
          `Found ${matches.length} matches in ${filePath}`,
        );
        return matches;
      } catch (e) {
        await this.logger.error(`Invalid regex pattern: ${regexPattern}`);
        throw new Error(`Invalid regex pattern: ${regexPattern}`);
      }
    } catch (e) {
      await this.logger.error(
        `Grep failed for ${filePath}: ${(e as Error).message}`,
      );
      throw e;
    }
  }

  async cat(filePath: string): Promise<string> {
    try {
      await this.logger.info(`Reading file ${filePath}`);
      const content = await fs.readFile(filePath, 'utf8');
      await this.logger.info(`Successfully read ${filePath}`);
      return content;
    } catch (e) {
      await this.logger.error(
        `Cat failed for ${filePath}: ${(e as Error).message}`,
      );
      throw e;
    }
  }

  async sed(
    search: string,
    replace: string,
    filePath: string,
    options: {
      useRegex?: boolean;
      caseInsensitive?: boolean;
      lookbehind?: string;
      lookahead?: string;
      count?: number;
    } = {},
  ): Promise<void> {
    try {
      await this.logger.info(
        `Replacing "${search}" with "${replace}" in ${filePath}`,
      );
      const content = await fs.readFile(filePath, 'utf8');
      let updatedContent: string;
      let occurrences = 0;
      if (!options.useRegex) {
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(
          escapedSearch,
          options.caseInsensitive ? 'gi' : 'g',
        );
        updatedContent = content.replace(regex, (match) => {
          if (options.count && occurrences >= options.count) return match;
          occurrences++;
          return replace;
        });
      } else {
        let pattern = search;
        if (options.lookbehind)
          pattern = `(?<=${options.lookbehind})${pattern}`;
        if (options.lookahead) pattern = `${pattern}(?=${options.lookahead})`;
        try {
          const regex = new RegExp(
            pattern,
            options.caseInsensitive ? 'gi' : 'g',
          );
          updatedContent = content.replace(regex, (match) => {
            if (options.count && occurrences >= options.count) return match;
            occurrences++;
            return replace;
          });
        } catch (e) {
          await this.logger.error(`Invalid regex pattern: ${pattern}`);
          throw new Error(`Invalid regex pattern: ${pattern}`);
        }
      }
      await this.createFile(filePath, updatedContent);
      await this.logger.info(
        `Successfully updated ${filePath} with ${occurrences} replacements`,
      );
    } catch (e) {
      await this.logger.error(
        `Sed failed for ${filePath}: ${(e as Error).message}`,
      );
      throw e;
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}