/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { type Config } from '../config/config.js';
import { SESSION_FILE_PREFIX } from './chatRecordingService.js';
import { spawnSync } from 'node:child_process';

export interface TeleportExportResult {
  packagePath: string;
  sessionId: string;
  filesIncluded: string[];
  blobUri?: string;
}

export interface TeleportImportResult {
  sessionId: string;
  projectIdentifier: string;
}

/**
 * Service for exporting and importing sessions to make them portable.
 */
export class TeleportService {
  constructor(private config: Config) {}

  /**
   * Exports a session to a tarball, optionally uploading to blob storage.
   */
  async exportSession(
    sessionId: string,
    outputPath: string,
    secret?: string,
    blobUri?: string,
  ): Promise<TeleportExportResult> {
    const storage = this.config.storage;
    const tempDir = storage.getProjectTempDir();
    const chatsDir = path.join(tempDir, 'chats');

    const chatFiles = await fs.promises.readdir(chatsDir);
    const chatFile = chatFiles.find(
      (f) =>
        f.startsWith(SESSION_FILE_PREFIX) &&
        f.includes(sessionId.slice(0, 8)) &&
        f.endsWith('.json'),
    );

    if (!chatFile) {
      throw new Error(`Chat file for session ${sessionId} not found.`);
    }

    const filesToInclude: string[] = [];

    const metadataFile = 'teleport-metadata.json';
    const metadataPath = path.join(tempDir, metadataFile);
    fs.writeFileSync(
      metadataPath,
      JSON.stringify({
        sessionId,
        exportedAt: new Date().toISOString(),
        isEncrypted: !!secret,
      }),
    );
    filesToInclude.push(metadataFile);
    filesToInclude.push(path.join('chats', chatFile));

    const logFile = `session-${sessionId}.jsonl`;
    const logPath = path.join(tempDir, 'logs', logFile);
    if (fs.existsSync(logPath)) {
      filesToInclude.push(path.join('logs', logFile));
    }

    const sessionDir = path.join(tempDir, sessionId);
    if (fs.existsSync(sessionDir)) {
      filesToInclude.push(sessionId);
    }

    const toolOutputDir = path.join(
      tempDir,
      'tool-outputs',
      `session-${sessionId}`,
    );
    if (fs.existsSync(toolOutputDir)) {
      filesToInclude.push(path.join('tool-outputs', `session-${sessionId}`));
    }

    const tarPath = secret ? `${outputPath}.tmp` : outputPath;
    const result = spawnSync('tar', [
      '-czf',
      tarPath,
      '-C',
      tempDir,
      ...filesToInclude,
    ]);

    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }

    if (result.status !== 0) {
      throw new Error(`Failed to create tarball: ${result.stderr.toString()}`);
    }

    if (secret) {
      try {
        this.encryptFile(tarPath, outputPath, secret);
        fs.unlinkSync(tarPath);
      } catch (e) {
        if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
        throw e;
      }
    }

    if (blobUri) {
      this.uploadToBlob(outputPath, blobUri);
    }

    return {
      packagePath: outputPath,
      sessionId,
      filesIncluded: filesToInclude,
      blobUri,
    };
  }

  /**
   * Imports a session from a tarball or blob storage.
   */
  async importSession(
    packagePathOrUri: string,
    secret?: string,
  ): Promise<TeleportImportResult> {
    const storage = this.config.storage;
    const tempDir = storage.getProjectTempDir();
    let packagePath = packagePathOrUri;
    let isTempBlobFile = false;

    if (
      packagePathOrUri.startsWith('gs://') ||
      packagePathOrUri.startsWith('s3://')
    ) {
      const fileName = path.basename(packagePathOrUri);
      packagePath = path.join(tempDir, `downloaded-${fileName}`);
      this.downloadFromBlob(packagePathOrUri, packagePath);
      isTempBlobFile = true;
    }

    let extractionPath = packagePath;
    let isTempExtractionFile = false;

    if (secret) {
      extractionPath = `${packagePath}.decrypted.tmp`;
      try {
        this.decryptFile(packagePath, extractionPath, secret);
        isTempExtractionFile = true;
      } finally {
        if (isTempBlobFile && fs.existsSync(packagePath)) {
          fs.unlinkSync(packagePath);
          isTempBlobFile = false;
        }
      }
    }

    try {
      fs.mkdirSync(tempDir, { recursive: true });

      const listResult = spawnSync('tar', ['-tf', extractionPath]);
      if (listResult.status === 0) {
        const files = listResult.stdout.toString().split('\n');
        for (const file of files) {
          if (!file) continue;
          if (path.isAbsolute(file) || file.includes('..')) {
            throw new Error(
              `Security violation: Malicious path detected in archive: ${file}`,
            );
          }
        }
      }

      const result = spawnSync('tar', ['-xzf', extractionPath, '-C', tempDir]);

      if (result.status !== 0) {
        throw new Error(
          `Failed to extract tarball: ${result.stderr.toString()}`,
        );
      }
    } finally {
      if (isTempExtractionFile && fs.existsSync(extractionPath)) {
        fs.unlinkSync(extractionPath);
      }
      if (isTempBlobFile && fs.existsSync(packagePath)) {
        fs.unlinkSync(packagePath);
      }
    }

    let sessionId: string | undefined;

    const metadataPath = path.join(tempDir, 'teleport-metadata.json');
    if (fs.existsSync(metadataPath)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-type-assertion
        sessionId = metadata.sessionId as string;
        fs.unlinkSync(metadataPath);
      } catch {
        // Fallback to heuristic
      }
    }

    if (!sessionId) {
      const chatsDir = path.join(tempDir, 'chats');
      const chatFiles = await fs.promises.readdir(chatsDir);

      const chatFilesWithStats = await Promise.all(
        chatFiles.map(async (f) => {
          const stats = await fs.promises.stat(path.join(chatsDir, f));
          return { file: f, mtime: stats.mtimeMs };
        }),
      );

      const latestChat = chatFilesWithStats.sort(
        (a, b) => b.mtime - a.mtime,
      )[0];
      if (!latestChat) {
        throw new Error('No chat files found after import.');
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const chatContent = JSON.parse(
        await fs.promises.readFile(
          path.join(chatsDir, latestChat.file),
          'utf8',
        ),
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-type-assertion
      sessionId = chatContent.sessionId as string;
    }

    if (!sessionId) {
      throw new Error('Could not determine session ID after import.');
    }

    return {
      sessionId,
      projectIdentifier: path.basename(tempDir),
    };
  }

  private encryptFile(inputPath: string, outputPath: string, secret: string) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 });
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const input = fs.readFileSync(inputPath);
    const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const output = Buffer.concat([salt, iv, authTag, encrypted]);
    fs.writeFileSync(outputPath, output);
  }

  private decryptFile(inputPath: string, outputPath: string, secret: string) {
    const input = fs.readFileSync(inputPath);
    if (input.length < 48) {
      throw new Error('Invalid or corrupted encrypted file.');
    }

    const salt = input.subarray(0, 16);
    const iv = input.subarray(16, 32);
    const authTag = input.subarray(32, 48);
    const encrypted = input.subarray(48);

    const key = crypto.scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 });
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    try {
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      fs.writeFileSync(outputPath, decrypted);
    } catch {
      throw new Error('Failed to decrypt. Incorrect secret or corrupted data.');
    }
  }

  private uploadToBlob(localPath: string, blobUri: string) {
    let result;
    if (blobUri.startsWith('gs://')) {
      result = spawnSync('gcloud', ['storage', 'cp', localPath, blobUri]);
      if (result.status !== 0) {
        result = spawnSync('gsutil', ['cp', localPath, blobUri]);
      }
    } else if (blobUri.startsWith('s3://')) {
      result = spawnSync('aws', ['s3', 'cp', localPath, blobUri]);
    } else {
      throw new Error(`Unsupported blob storage URI scheme: ${blobUri}`);
    }

    if (result.status !== 0) {
      throw new Error(
        `Failed to upload to blob storage: ${result.stderr.toString()}`,
      );
    }
  }

  private downloadFromBlob(blobUri: string, localPath: string) {
    let result;
    if (blobUri.startsWith('gs://')) {
      result = spawnSync('gcloud', ['storage', 'cp', blobUri, localPath]);
      if (result.status !== 0) {
        result = spawnSync('gsutil', ['cp', blobUri, localPath]);
      }
    } else if (blobUri.startsWith('s3://')) {
      result = spawnSync('aws', ['s3', 'cp', blobUri, localPath]);
    } else {
      throw new Error(`Unsupported blob storage URI scheme: ${blobUri}`);
    }

    if (result.status !== 0) {
      throw new Error(
        `Failed to download from blob storage: ${result.stderr.toString()}`,
      );
    }
  }
}
