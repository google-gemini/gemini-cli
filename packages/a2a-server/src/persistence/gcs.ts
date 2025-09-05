/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage } from '@google-cloud/storage';
import { gzipSync, gunzipSync } from 'node:zlib';
import * as tar from 'tar';
import * as fse from 'fs-extra';
import { promises as fsPromises, createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Task as SDKTask } from '@a2a-js/sdk';
import type { TaskStore } from '@a2a-js/sdk/server';
import { logger } from '../utils/logger.js';
import { setTargetDir } from '../config/config.js';
import { getPersistedState, type PersistedTaskMetadata } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

type ObjectType = 'metadata' | 'workspace';

const getTmpArchiveFilename = (taskId: string): string =>
  `task-${taskId}-workspace-${uuidv4()}.tar.gz`;

export class GCSTaskStore implements TaskStore {
  private storage: Storage;
  private bucketName: string;
  private bucketInitialized: Promise<void>;

  constructor(bucketName: string) {
    if (!bucketName) {
      throw new Error('GCS bucket name is required.');
    }
    this.storage = new Storage();
    this.bucketName = bucketName;
    logger.info(`GCSTaskStore initializing with bucket: ${this.bucketName}`);
    // Prerequisites: user account or service account must have storage admin IAM role
    // and the bucket name must be unique.
    this.bucketInitialized = this.initializeBucket();
  }

  private async initializeBucket(): Promise<void> {
    try {
      const [buckets] = await this.storage.getBuckets();
      const exists = buckets.some((bucket) => bucket.name === this.bucketName);

      if (!exists) {
        logger.info(
          `Bucket ${this.bucketName} does not exist in the list. Attempting to create...`,
        );
        try {
          await this.storage.createBucket(this.bucketName);
          logger.info(`Bucket ${this.bucketName} created successfully.`);
        } catch (createError) {
          logger.info(
            `Failed to create bucket ${this.bucketName}: ${createError}`,
          );
          throw new Error(
            `Failed to create GCS bucket ${this.bucketName}: ${createError}`,
          );
        }
      } else {
        logger.info(`Bucket ${this.bucketName} exists.`);
      }
    } catch (error) {
      logger.info(
        `Error during bucket initialization for ${this.bucketName}: ${error}`,
      );
      throw new Error(
        `Failed to initialize GCS bucket ${this.bucketName}: ${error}`,
      );
    }
  }

  private async ensureBucketInitialized(): Promise<void> {
    await this.bucketInitialized;
  }

  private getObjectPath(taskId: string, type: ObjectType): string {
    return `tasks/${taskId}/${type}.tar.gz`;
  }

  async save(task: SDKTask): Promise<void> {
    await this.ensureBucketInitialized();
    const taskId = task.id;
    const persistedState = getPersistedState(
      task.metadata as PersistedTaskMetadata,
    );

    if (!persistedState) {
      throw new Error(`Task ${taskId} is missing persisted state in metadata.`);
    }
    const workDir = process.cwd();

    const metadataObjectPath = this.getObjectPath(taskId, 'metadata');
    const workspaceObjectPath = this.getObjectPath(taskId, 'workspace');

    const dataToStore = task.metadata;

    try {
      const jsonString = JSON.stringify(dataToStore);
      const compressedMetadata = gzipSync(Buffer.from(jsonString));
      const metadataFile = this.storage
        .bucket(this.bucketName)
        .file(metadataObjectPath);
      await metadataFile.save(compressedMetadata, {
        contentType: 'application/gzip',
      });
      logger.info(
        `Task ${taskId} metadata saved to GCS: gs://${this.bucketName}/${metadataObjectPath}`,
      );

      if (await fse.pathExists(workDir)) {
        const entries = await fsPromises.readdir(workDir);
        if (entries.length > 0) {
          const tmpArchiveFile = join(tmpdir(), getTmpArchiveFilename(taskId));
          try {
            await tar.c(
              {
                gzip: true,
                file: tmpArchiveFile,
                cwd: workDir,
                portable: true,
              },
              entries,
            );

            if (!(await fse.pathExists(tmpArchiveFile))) {
              throw new Error(
                `tar.c command failed to create ${tmpArchiveFile}`,
              );
            }

            const workspaceFile = this.storage
              .bucket(this.bucketName)
              .file(workspaceObjectPath);
            const sourceStream = createReadStream(tmpArchiveFile);
            const destStream = workspaceFile.createWriteStream({
              contentType: 'application/gzip',
              resumable: true,
            });

            await new Promise<void>((resolve, reject) => {
              sourceStream.on('error', (err) => {
                logger.error(
                  `Error in source stream for ${tmpArchiveFile}:`,
                  err,
                );
                // Attempt to close destStream if source fails
                if (!destStream.destroyed) {
                  destStream.destroy(err);
                }
                reject(err);
              });

              destStream.on('error', (err) => {
                logger.error(
                  `Error in GCS dest stream for ${workspaceObjectPath}:`,
                  err,
                );
                reject(err);
              });

              destStream.on('finish', () => {
                logger.info(
                  `GCS destStream finished for ${workspaceObjectPath}`,
                );
                resolve();
              });

              logger.info(
                `Piping ${tmpArchiveFile} to GCS object ${workspaceObjectPath}`,
              );
              sourceStream.pipe(destStream);
            });
            logger.info(
              `Task ${taskId} workspace saved to GCS: gs://${this.bucketName}/${workspaceObjectPath}`,
            );
          } catch (error) {
            logger.error(
              `Error during workspace save process for ${taskId}:`,
              error,
            );
            throw error;
          } finally {
            logger.info(`Cleaning up temporary file: ${tmpArchiveFile}`);
            try {
              if (await fse.pathExists(tmpArchiveFile)) {
                await fse.remove(tmpArchiveFile);
                logger.info(
                  `Successfully removed temporary file: ${tmpArchiveFile}`,
                );
              } else {
                logger.warn(
                  `Temporary file not found for cleanup: ${tmpArchiveFile}`,
                );
              }
            } catch (removeError) {
              logger.error(
                `Error removing temporary file ${tmpArchiveFile}:`,
                removeError,
              );
            }
          }
        } else {
          logger.info(
            `Workspace directory ${workDir} is empty, skipping workspace save for task ${taskId}.`,
          );
        }
      } else {
        logger.info(
          `Workspace directory ${workDir} not found, skipping workspace save for task ${taskId}.`,
        );
      }
    } catch (error) {
      logger.error(`Failed to save task ${taskId} to GCS:`, error);
      throw error;
    }
  }

  async load(taskId: string): Promise<SDKTask | undefined> {
    await this.ensureBucketInitialized();
    const metadataObjectPath = this.getObjectPath(taskId, 'metadata');
    const workspaceObjectPath = this.getObjectPath(taskId, 'workspace');

    try {
      const metadataFile = this.storage
        .bucket(this.bucketName)
        .file(metadataObjectPath);
      const [metadataExists] = await metadataFile.exists();
      if (!metadataExists) {
        logger.info(`Task ${taskId} metadata not found in GCS.`);
        return undefined;
      }
      const [compressedMetadata] = await metadataFile.download();
      const jsonData = gunzipSync(compressedMetadata).toString();
      const loadedMetadata = JSON.parse(jsonData);
      logger.info(`Task ${taskId} metadata loaded from GCS.`);

      const persistedState = getPersistedState(loadedMetadata);
      if (!persistedState) {
        throw new Error(
          `Loaded metadata for task ${taskId} is missing internal persisted state.`,
        );
      }
      const agentSettings = persistedState._agentSettings;

      const workDir = setTargetDir(agentSettings);
      await fse.ensureDir(workDir);
      const workspaceFile = this.storage
        .bucket(this.bucketName)
        .file(workspaceObjectPath);
      const [workspaceExists] = await workspaceFile.exists();
      if (workspaceExists) {
        const tmpArchiveFile = join(tmpdir(), getTmpArchiveFilename(taskId));
        try {
          await workspaceFile.download({ destination: tmpArchiveFile });
          await tar.x({ file: tmpArchiveFile, cwd: workDir });
          logger.info(
            `Task ${taskId} workspace restored from GCS to ${workDir}`,
          );
        } finally {
          if (await fse.pathExists(tmpArchiveFile)) {
            await fse.remove(tmpArchiveFile);
          }
        }
      } else {
        logger.info(`Task ${taskId} workspace archive not found in GCS.`);
      }

      return {
        id: taskId,
        contextId: loadedMetadata._contextId || uuidv4(),
        kind: 'task',
        status: {
          state: persistedState._taskState,
          timestamp: new Date().toISOString(),
        },
        metadata: loadedMetadata,
        history: [],
        artifacts: [],
      };
    } catch (error) {
      logger.error(`Failed to load task ${taskId} from GCS:`, error);
      throw error;
    }
  }
}

export class NoOpTaskStore implements TaskStore {
  constructor(private realStore: TaskStore) {}

  async save(task: SDKTask): Promise<void> {
    logger.info(`[NoOpTaskStore] save called for task ${task.id} - IGNORED`);
    return Promise.resolve();
  }

  async load(taskId: string): Promise<SDKTask | undefined> {
    logger.info(
      `[NoOpTaskStore] load called for task ${taskId}, delegating to real store.`,
    );
    return this.realStore.load(taskId);
  }
}
