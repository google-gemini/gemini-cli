/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fsPromises from 'node:fs/promises';
import path from 'node:path';
import * as Diff from 'diff';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolCallConfirmationDetails,
  type ToolEditConfirmationDetails,
  type ToolConfirmationOutcome,
  type ToolInvocation,
  type ToolLocation,
  type ToolResult,
  type ExecuteOptions,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isNodeError } from '../utils/errors.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { debugLogger } from '../utils/debugLogger.js';
import { correctPath } from '../utils/pathCorrector.js';
import { resolveAndValidatePlanPath } from '../utils/planUtils.js';
import {
  RESTORE_FILE_TOOL_NAME,
  RESTORE_FILE_DISPLAY_NAME,
} from './tool-names.js';
import {
  createPreWriteBackup,
  listBackupVersions,
  getBackupPath,
} from './file-backup.js';

export interface RestoreFileToolParams {
  /** The absolute path to the file to restore. */
  file_path: string;
  /** The backup version to restore (as reported by write_file). */
  version: number;
}

class RestoreFileToolInvocation extends BaseToolInvocation<
  RestoreFileToolParams,
  ToolResult
> {
  private readonly resolvedPath: string;

  constructor(
    private readonly config: Config,
    params: RestoreFileToolParams,
    messageBus: MessageBus,
  ) {
    super(
      params,
      messageBus,
      RESTORE_FILE_TOOL_NAME,
      RESTORE_FILE_DISPLAY_NAME,
      undefined,
      undefined,
      true,
      () => this.config.getApprovalMode(),
    );
    const filePath = this.params.file_path?.trim() ?? '';
    if (this.config.isPlanMode()) {
      try {
        this.resolvedPath = resolveAndValidatePlanPath(
          filePath,
          this.config.storage.getPlansDir(),
          this.config.getProjectRoot(),
        );
      } catch (e) {
        debugLogger.error(
          'Failed to resolve plan path during RestoreFileTool invocation setup',
          e,
        );
        this.resolvedPath = filePath;
      }
    } else if (!path.isAbsolute(filePath)) {
      const result = correctPath(filePath, this.config);
      if (result.success) {
        this.resolvedPath = result.correctedPath;
      } else {
        this.resolvedPath = path.resolve(this.config.getTargetDir(), filePath);
      }
    } else {
      this.resolvedPath = filePath;
    }
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.resolvedPath }];
  }

  override getDescription(): string {
    const relativePath = makeRelative(
      this.resolvedPath,
      this.config.getTargetDir(),
    );
    return `Restoring ${shortenPath(relativePath)} to version ${this.params.version}`;
  }

  private getBackupFilePath(): string {
    return getBackupPath(
      this.resolvedPath,
      this.params.version,
      this.config.storage.getProjectBackupDir(),
    );
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const backupPath = this.getBackupFilePath();
    const fileName = path.basename(this.resolvedPath);
    const relativePath = makeRelative(
      this.resolvedPath,
      this.config.getTargetDir(),
    );

    let currentContent = '';
    let backupContent = '';
    try {
      backupContent = await fsPromises.readFile(backupPath, 'utf8');
    } catch {
      return false;
    }
    try {
      currentContent = await fsPromises.readFile(this.resolvedPath, 'utf8');
    } catch (e) {
      if (!isNodeError(e) || e.code !== 'ENOENT') {
        debugLogger.warn(
          'Failed to read current file for confirmation diff:',
          e,
        );
      }
    }

    const fileDiff = Diff.createPatch(
      fileName,
      currentContent,
      backupContent,
      'Current',
      `Version ${this.params.version}`,
      DEFAULT_DIFF_OPTIONS,
    );

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `Confirm Restore: ${shortenPath(relativePath)} → version ${this.params.version}`,
      fileName,
      filePath: this.resolvedPath,
      fileDiff,
      originalContent: currentContent,
      newContent: backupContent,
      onConfirm: async (_outcome: ToolConfirmationOutcome) => {},
    };
    return confirmationDetails;
  }

  private formatVersions(versions: number[]): string {
    return versions.join(', ');
  }

  private async listAvailableVersions(): Promise<number[]> {
    return listBackupVersions(
      this.resolvedPath,
      this.config.storage.getProjectBackupDir(),
    );
  }

  async execute({
    abortSignal: _abortSignal,
  }: ExecuteOptions): Promise<ToolResult> {
    const validationError = this.config.validatePathAccess(this.resolvedPath);
    if (validationError) {
      return {
        llmContent: validationError,
        returnDisplay: 'Error: Path not in workspace.',
        error: {
          message: validationError,
          type: ToolErrorType.PATH_NOT_IN_WORKSPACE,
        },
      };
    }

    // version 0 is a discovery call — return available versions without restoring.
    if (this.params.version === 0) {
      const versions = await this.listAvailableVersions();
      const relativePath = makeRelative(
        this.resolvedPath,
        this.config.getTargetDir(),
      );
      const msg =
        versions.length > 0
          ? `Backup versions for ${shortenPath(relativePath)}: ${this.formatVersions(versions)}.`
          : `No backups available for ${shortenPath(relativePath)}.`;
      return { llmContent: msg, returnDisplay: msg };
    }

    const backupPath = this.getBackupFilePath();

    try {
      await fsPromises.access(backupPath);
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') {
        const versions = await this.listAvailableVersions();
        const hint =
          versions.length > 0
            ? ` Available: ${this.formatVersions(versions)}.`
            : '';
        const msg = `No backup for version ${this.params.version} of ${path.basename(this.resolvedPath)}.${hint}`;
        return {
          llmContent: msg,
          returnDisplay: msg,
          error: { message: msg, type: ToolErrorType.FILE_WRITE_FAILURE },
        };
      }
      const msg = isNodeError(e)
        ? `Cannot access backup for version ${this.params.version} of ${path.basename(this.resolvedPath)}: ${e.message} (${e.code})`
        : `Cannot access backup for version ${this.params.version} of ${path.basename(this.resolvedPath)}: ${String(e)}`;
      return {
        llmContent: msg,
        returnDisplay: msg,
        error: { message: msg, type: ToolErrorType.FILE_WRITE_FAILURE },
      };
    }

    const preRestoreBackup = await createPreWriteBackup(
      this.resolvedPath,
      this.config.storage.getProjectBackupDir(),
    );
    if (!preRestoreBackup.ok && !preRestoreBackup.newFile) {
      const msg = `Cannot back up current state of ${path.basename(this.resolvedPath)} before restoring. Aborting to prevent data loss.`;
      return {
        llmContent: msg,
        returnDisplay: msg,
        error: { message: msg, type: ToolErrorType.FILE_WRITE_FAILURE },
      };
    }

    try {
      await fsPromises.mkdir(path.dirname(this.resolvedPath), {
        recursive: true,
      });
    } catch (e) {
      const msg = isNodeError(e)
        ? `Cannot create parent directory for ${path.basename(this.resolvedPath)}: ${e.message} (${e.code})`
        : `Cannot create parent directory for ${path.basename(this.resolvedPath)}: ${String(e)}`;
      return {
        llmContent: msg,
        returnDisplay: msg,
        error: { message: msg, type: ToolErrorType.FILE_WRITE_FAILURE },
      };
    }

    try {
      await fsPromises.copyFile(backupPath, this.resolvedPath);
    } catch (e) {
      const msg = isNodeError(e)
        ? `Error restoring file: ${e.message} (${e.code})`
        : `Error restoring file: ${String(e)}`;
      return {
        llmContent: msg,
        returnDisplay: msg,
        error: { message: msg, type: ToolErrorType.FILE_WRITE_FAILURE },
      };
    }

    const relativePath = makeRelative(
      this.resolvedPath,
      this.config.getTargetDir(),
    );
    const msg = `Successfully restored ${shortenPath(relativePath)} to version ${this.params.version}.`;
    return { llmContent: msg, returnDisplay: msg };
  }
}

export class RestoreFileTool extends BaseDeclarativeTool<
  RestoreFileToolParams,
  ToolResult
> {
  static readonly Name = RESTORE_FILE_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      RestoreFileTool.Name,
      RESTORE_FILE_DISPLAY_NAME,
      'Restores a file to a backup version created by write_file before each overwrite. ' +
        'Use version 0 to list available backup versions without restoring.',
      Kind.Edit,
      {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The path to the file to restore.',
          },
          version: {
            type: 'integer',
            description:
              'The backup version to restore, as reported by write_file after each overwrite. ' +
              'Pass 0 to list all available versions for the file without restoring.',
          },
        },
        required: ['file_path', 'version'],
      },
      messageBus,
      true,
      false,
    );
  }

  protected override validateToolParamValues(
    params: RestoreFileToolParams,
  ): string | null {
    const filePath = params.file_path?.trim();
    if (!filePath) {
      return 'file_path is required';
    }
    if (
      typeof params.version !== 'number' ||
      !Number.isSafeInteger(params.version) ||
      params.version < 0
    ) {
      return 'version must be a non-negative integer';
    }
    const resolvedPath = path.resolve(this.config.getTargetDir(), filePath);
    return this.config.validatePathAccess(resolvedPath);
  }

  protected createInvocation(
    params: RestoreFileToolParams,
    messageBus: MessageBus,
  ): ToolInvocation<RestoreFileToolParams, ToolResult> {
    return new RestoreFileToolInvocation(this.config, params, messageBus);
  }
}
