/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import archiver from 'archiver';
import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { logger } from '../core/logger.js';

export interface BackupToolParams {
  /**
   * The directory to backup. Defaults to the current working directory.
   */
  directory?: string;
  /**
   * The name of the backup file (without extension). Defaults to a timestamp.
   */
  name?: string;
}

export class BackupTool extends BaseTool<BackupToolParams, ToolResult> {
  static readonly Name = 'backup';

  constructor(private readonly projectRoot: string) {
    super(
      BackupTool.Name,
      'Backup',
      'Creates a timestamped zip archive of the specified directory.',
      {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: 'The directory to backup. Defaults to the current working directory.',
          },
          name: {
            type: 'string',
            description: 'The name of the backup file (without extension). Defaults to a timestamp.',
          },
        },
      },
    );
  }

  override validateToolParams(params: BackupToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return `Parameters failed schema validation.`;
    }

    if (params.directory) {
      const targetPath = path.resolve(this.projectRoot, params.directory);
      if (!fs.existsSync(targetPath)) {
        return `Directory does not exist: ${params.directory}`;
      }
      if (!fs.statSync(targetPath).isDirectory()) {
        return `Path is not a directory: ${params.directory}`;
      }
    }

    return null;
  }

  override getDescription(params: BackupToolParams): string {
    const dir = params.directory || 'current project directory';
    const name = params.name ? ` as ${params.name}.zip` : '';
    return `Creating a backup of ${dir}${name}`;
  }

  async execute(params: BackupToolParams): Promise<ToolResult> {
    const targetDir = params.directory
      ? path.resolve(this.projectRoot, params.directory)
      : this.projectRoot;
    const backupName = params.name || `backup-${Date.now()}`;
    const outputPath = path.join(this.projectRoot, `${backupName}.zip`);

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 }, // Sets the compression level.
      });

      output.on('close', () => {
        logger.info(`Backup created: ${outputPath} (${archive.pointer()} bytes)`);
        resolve({
          llmContent: `Backup created successfully at ${outputPath}`,
          returnDisplay: `Backup created: ${outputPath}`,
        });
      });

      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          logger.warn(`Backup warning: ${err.message}`);
        } else {
          reject(err);
        }
      });

      archive.on('error', (err) => {
        logger.error(`Backup error: ${err.message}`);
        reject(err);
      });

      archive.pipe(output);
      archive.directory(targetDir, false);
      archive.finalize();
    }).catch((err) => {
      logger.error(`Failed to create backup: ${err.message}`);
      return {
        llmContent: `Failed to create backup: ${err.message}`,
        returnDisplay: `Error: Failed to create backup.`,
      };
    });
  }
}
