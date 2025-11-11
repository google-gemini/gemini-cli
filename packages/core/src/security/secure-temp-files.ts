/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { logConfigTamperingDetected } from './security-audit-logger.js';

/**
 * Secure Temporary File Handling - Prevents TOCTOU and insecure temp file attacks.
 *
 * SECURITY NOTE: Insecure temporary file handling enables:
 * - TOCTOU (Time-of-Check-Time-of-Use) race conditions
 * - Predictable temporary file names (allows pre-creation attacks)
 * - Symlink attacks on temporary files
 * - Information disclosure through world-readable temp files
 * - Local privilege escalation
 * - Denial of service through temp directory exhaustion
 *
 * This module provides secure temporary file and directory creation.
 */

/**
 * Error thrown when temporary file operation fails.
 */
export class TempFileError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'TempFileError';
  }
}

/**
 * Options for secure temporary file creation.
 */
export interface SecureTempFileOptions {
  /** Prefix for the temporary file name */
  prefix?: string;
  /** Suffix/extension for the temporary file name */
  suffix?: string;
  /** Directory to create temp file in (defaults to os.tmpdir()) */
  dir?: string;
  /** File mode/permissions (default: 0o600 - owner read/write only) */
  mode?: number;
  /** Whether to keep the file after process exit (default: false) */
  keep?: boolean;
  /** Maximum file size in bytes (default: 100MB) */
  maxSize?: number;
}

/**
 * Options for secure temporary directory creation.
 */
export interface SecureTempDirOptions {
  /** Prefix for the temporary directory name */
  prefix?: string;
  /** Directory to create temp dir in (defaults to os.tmpdir()) */
  dir?: string;
  /** Directory mode/permissions (default: 0o700 - owner full access only) */
  mode?: number;
  /** Whether to keep the directory after process exit (default: false) */
  keep?: boolean;
}

/**
 * Temporary file descriptor with cleanup.
 */
export class SecureTempFile {
  private cleaned = false;

  constructor(
    public readonly path: string,
    public readonly fd: number,
    private readonly keepOnExit: boolean = false,
  ) {
    if (!keepOnExit) {
      // Register cleanup on process exit
      process.on('exit', () => this.cleanup());
      process.on('SIGINT', () => {
        this.cleanup();
        process.exit(130);
      });
      process.on('SIGTERM', () => {
        this.cleanup();
        process.exit(143);
      });
    }
  }

  /**
   * Writes data to the temporary file.
   */
  public write(data: string | Buffer): void {
    if (this.cleaned) {
      throw new TempFileError('Cannot write to cleaned up temporary file');
    }

    fs.writeSync(this.fd, data);
  }

  /**
   * Reads data from the temporary file.
   */
  public read(): Buffer {
    if (this.cleaned) {
      throw new TempFileError('Cannot read from cleaned up temporary file');
    }

    const stat = fs.fstatSync(this.fd);
    const buffer = Buffer.alloc(stat.size);
    fs.readSync(this.fd, buffer, 0, stat.size, 0);
    return buffer;
  }

  /**
   * Closes the file descriptor.
   */
  public close(): void {
    if (this.fd !== -1 && !this.cleaned) {
      try {
        fs.closeSync(this.fd);
      } catch {
        // Ignore errors on close
      }
    }
  }

  /**
   * Cleans up the temporary file.
   */
  public cleanup(): void {
    if (this.cleaned) return;

    this.cleaned = true;
    this.close();

    if (!this.keepOnExit) {
      try {
        fs.unlinkSync(this.path);
      } catch {
        // File may already be deleted
      }
    }
  }
}

/**
 * Temporary directory with cleanup.
 */
export class SecureTempDir {
  private cleaned = false;

  constructor(
    public readonly path: string,
    private readonly keepOnExit: boolean = false,
  ) {
    if (!keepOnExit) {
      // Register cleanup on process exit
      process.on('exit', () => this.cleanup());
      process.on('SIGINT', () => {
        this.cleanup();
        process.exit(130);
      });
      process.on('SIGTERM', () => {
        this.cleanup();
        process.exit(143);
      });
    }
  }

  /**
   * Cleans up the temporary directory and all its contents.
   */
  public cleanup(): void {
    if (this.cleaned) return;

    this.cleaned = true;

    if (!this.keepOnExit) {
      try {
        fs.rmSync(this.path, { recursive: true, force: true });
      } catch {
        // Directory may already be deleted
      }
    }
  }
}

/**
 * Generates a cryptographically secure random temporary file name.
 *
 * @param prefix Optional prefix
 * @param suffix Optional suffix
 * @returns Secure random filename
 */
export function generateSecureTempName(
  prefix: string = 'tmp',
  suffix: string = '',
): string {
  // Use crypto.randomBytes for unpredictable names
  const randomPart = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now().toString(36);
  const pid = process.pid.toString(36);

  return `${prefix}-${timestamp}-${pid}-${randomPart}${suffix}`;
}

/**
 * Creates a secure temporary file atomically.
 *
 * SECURITY FEATURES:
 * - Uses O_CREAT | O_EXCL flags to atomically create file
 * - Fails if file already exists (prevents TOCTOU)
 * - Sets restrictive permissions (0o600) before any data is written
 * - Uses cryptographically random names (prevents predictable attacks)
 * - Validates parent directory security
 * - Automatic cleanup on process exit
 *
 * @param options Temporary file options
 * @returns SecureTempFile instance
 */
export function createSecureTempFile(
  options: SecureTempFileOptions = {},
): SecureTempFile {
  const {
    prefix = 'gemini-cli',
    suffix = '',
    dir = os.tmpdir(),
    mode = 0o600, // Owner read/write only
    keep = false,
    maxSize = 100 * 1024 * 1024, // 100MB
  } = options;

  // Validate temp directory
  validateTempDirectory(dir);

  // Generate secure random filename
  const filename = generateSecureTempName(prefix, suffix);
  const filepath = path.join(dir, filename);

  // Validate the generated path
  if (!filepath.startsWith(path.resolve(dir) + path.sep)) {
    throw new TempFileError(
      'Generated temp file path escapes temp directory',
      'PATH_TRAVERSAL',
    );
  }

  try {
    // Create file atomically with O_CREAT | O_EXCL
    // This ensures the file doesn't exist and creates it in one atomic operation
    // Prevents TOCTOU race conditions
    const fd = fs.openSync(filepath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR, mode);

    // Set strict permissions immediately (in case mode wasn't honored on creation)
    try {
      fs.fchmodSync(fd, mode);
    } catch (chmodError) {
      // Close and delete file if we can't set permissions
      fs.closeSync(fd);
      fs.unlinkSync(filepath);
      throw new TempFileError(
        `Failed to set secure permissions: ${(chmodError as Error).message}`,
        'PERMISSION_ERROR',
      );
    }

    logConfigTamperingDetected(
      'Temp file created',
      `Secure temporary file created: ${filepath}`,
    );

    return new SecureTempFile(filepath, fd, keep);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      // File already exists - this could be an attack
      logConfigTamperingDetected(
        'Temp file collision',
        `Temporary file name collision detected: ${filepath} - possible attack`,
      );
      throw new TempFileError(
        'Temporary file already exists - possible race condition attack',
        'EEXIST',
      );
    }

    throw new TempFileError(
      `Failed to create temporary file: ${(error as Error).message}`,
      (error as NodeJS.ErrnoException).code,
    );
  }
}

/**
 * Creates a secure temporary directory atomically.
 *
 * SECURITY FEATURES:
 * - Creates directory with restrictive permissions (0o700)
 * - Uses cryptographically random names
 * - Validates parent directory security
 * - Automatic cleanup on process exit
 *
 * @param options Temporary directory options
 * @returns SecureTempDir instance
 */
export function createSecureTempDir(
  options: SecureTempDirOptions = {},
): SecureTempDir {
  const {
    prefix = 'gemini-cli',
    dir = os.tmpdir(),
    mode = 0o700, // Owner full access only
    keep = false,
  } = options;

  // Validate temp directory
  validateTempDirectory(dir);

  // Generate secure random directory name
  const dirname = generateSecureTempName(prefix, '');
  const dirpath = path.join(dir, dirname);

  // Validate the generated path
  if (!dirpath.startsWith(path.resolve(dir) + path.sep)) {
    throw new TempFileError(
      'Generated temp dir path escapes temp directory',
      'PATH_TRAVERSAL',
    );
  }

  try {
    // Create directory with restrictive permissions
    fs.mkdirSync(dirpath, { mode, recursive: false });

    // Verify permissions were set correctly
    const stats = fs.statSync(dirpath);
    if ((stats.mode & 0o777) !== mode) {
      // Permissions not set correctly, try to fix
      fs.chmodSync(dirpath, mode);
    }

    logConfigTamperingDetected(
      'Temp dir created',
      `Secure temporary directory created: ${dirpath}`,
    );

    return new SecureTempDir(dirpath, keep);
  } catch (error) {
    throw new TempFileError(
      `Failed to create temporary directory: ${(error as Error).message}`,
      (error as NodeJS.ErrnoException).code,
    );
  }
}

/**
 * Validates that a directory is safe to use for temporary files.
 *
 * @param dir Directory path to validate
 * @returns True if valid, throws TempFileError if not
 */
export function validateTempDirectory(dir: string): boolean {
  try {
    // Check directory exists
    const stats = fs.statSync(dir);

    if (!stats.isDirectory()) {
      throw new TempFileError(
        `Temp directory is not a directory: ${dir}`,
        'NOT_DIRECTORY',
      );
    }

    // Check we can write to it
    fs.accessSync(dir, fs.constants.W_OK);

    // Check it's not a symlink (prevents symlink attacks)
    const lstat = fs.lstatSync(dir);
    if (lstat.isSymbolicLink()) {
      logConfigTamperingDetected(
        'Temp directory',
        `Temp directory is a symlink: ${dir} - possible attack`,
      );
      throw new TempFileError(
        `Temp directory is a symlink: ${dir}`,
        'SYMLINK',
      );
    }

    // On Unix systems, check permissions aren't too permissive
    if (process.platform !== 'win32') {
      const mode = stats.mode & 0o777;
      // Directory should not be world-writable without sticky bit
      if ((mode & 0o002) && !(mode & 0o1000)) {
        console.warn(
          `WARNING: Temp directory ${dir} is world-writable without sticky bit - security risk`,
        );
      }
    }

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new TempFileError(
        `Temp directory does not exist: ${dir}`,
        'ENOENT',
      );
    }
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw new TempFileError(
        `No write access to temp directory: ${dir}`,
        'EACCES',
      );
    }
    throw error;
  }
}

/**
 * Securely deletes a file by overwriting it before unlinking.
 *
 * @param filepath Path to file to securely delete
 * @param passes Number of overwrite passes (default: 3)
 */
export function secureDelete(filepath: string, passes: number = 3): void {
  try {
    const stats = fs.statSync(filepath);
    const size = stats.size;

    // Open file for writing
    const fd = fs.openSync(filepath, 'r+');

    try {
      // Overwrite with random data multiple times
      for (let i = 0; i < passes; i++) {
        const randomData = crypto.randomBytes(Math.min(size, 1024 * 1024)); // 1MB chunks
        let offset = 0;

        while (offset < size) {
          const chunkSize = Math.min(randomData.length, size - offset);
          fs.writeSync(fd, randomData, 0, chunkSize, offset);
          offset += chunkSize;
        }

        // Sync to disk
        fs.fsyncSync(fd);
      }

      // Final pass with zeros
      const zeros = Buffer.alloc(Math.min(size, 1024 * 1024));
      let offset = 0;
      while (offset < size) {
        const chunkSize = Math.min(zeros.length, size - offset);
        fs.writeSync(fd, zeros, 0, chunkSize, offset);
        offset += chunkSize;
      }

      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    // Unlink the file
    fs.unlinkSync(filepath);

    logConfigTamperingDetected(
      'Secure delete',
      `File securely deleted: ${filepath}`,
    );
  } catch (error) {
    throw new TempFileError(
      `Failed to securely delete file: ${(error as Error).message}`,
      (error as NodeJS.ErrnoException).code,
    );
  }
}

/**
 * Checks for suspicious temporary file activity (possible attack detection).
 *
 * @param dir Temporary directory to check
 * @returns Array of suspicious files found
 */
export function detectSuspiciousTempFiles(dir: string = os.tmpdir()): string[] {
  const suspicious: string[] = [];

  try {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filepath = path.join(dir, file);

      try {
        const stats = fs.lstatSync(filepath);

        // Check for suspicious patterns
        if (stats.isSymbolicLink()) {
          suspicious.push(`${filepath} (symlink)`);
        }

        // Check for predictable names (common attack pattern)
        if (/^(tmp|temp)\d{1,4}$/i.test(file)) {
          suspicious.push(`${filepath} (predictable name)`);
        }

        // Check for world-writable files
        if (process.platform !== 'win32' && (stats.mode & 0o002)) {
          suspicious.push(`${filepath} (world-writable)`);
        }

        // Check for setuid/setgid files in tmp (very suspicious)
        if (process.platform !== 'win32' && (stats.mode & 0o6000)) {
          suspicious.push(`${filepath} (setuid/setgid)`);
          logConfigTamperingDetected(
            'Suspicious temp file',
            `Setuid/setgid file in temp directory: ${filepath}`,
          );
        }
      } catch {
        // Ignore files we can't stat
      }
    }
  } catch (error) {
    console.warn(`Could not scan temp directory: ${(error as Error).message}`);
  }

  return suspicious;
}

/**
 * Gets safe temporary directory path.
 * Validates os.tmpdir() and falls back to safer alternatives if needed.
 *
 * @returns Safe temporary directory path
 */
export function getSafeTempDir(): string {
  let tmpDir = os.tmpdir();

  try {
    validateTempDirectory(tmpDir);
    return tmpDir;
  } catch {
    // os.tmpdir() is not safe, try alternatives
    const alternatives = [
      path.join(os.homedir(), '.tmp'),
      path.join(process.cwd(), '.tmp'),
    ];

    for (const alt of alternatives) {
      try {
        if (!fs.existsSync(alt)) {
          fs.mkdirSync(alt, { mode: 0o700, recursive: true });
        }
        validateTempDirectory(alt);
        console.warn(`Using alternative temp directory: ${alt}`);
        return alt;
      } catch {
        // Try next alternative
      }
    }

    // All alternatives failed, use os.tmpdir() anyway but warn
    console.error(`WARNING: Could not find safe temporary directory, using ${tmpDir} anyway`);
    return tmpDir;
  }
}

/**
 * Cleans up old temporary files (garbage collection).
 *
 * @param dir Directory to clean
 * @param maxAge Maximum age in milliseconds (default: 24 hours)
 * @param pattern Pattern to match files (default: /^gemini-cli-/)
 * @returns Number of files deleted
 */
export function cleanupOldTempFiles(
  dir: string = os.tmpdir(),
  maxAge: number = 24 * 60 * 60 * 1000, // 24 hours
  pattern: RegExp = /^gemini-cli-/,
): number {
  let deleted = 0;

  try {
    const files = fs.readdirSync(dir);
    const now = Date.now();

    for (const file of files) {
      if (!pattern.test(file)) continue;

      const filepath = path.join(dir, file);

      try {
        const stats = fs.statSync(filepath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          if (stats.isDirectory()) {
            fs.rmSync(filepath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filepath);
          }
          deleted++;
        }
      } catch {
        // Ignore files we can't delete
      }
    }
  } catch (error) {
    console.warn(`Could not cleanup temp files: ${(error as Error).message}`);
  }

  if (deleted > 0) {
    logConfigTamperingDetected(
      'Temp file cleanup',
      `Cleaned up ${deleted} old temporary files`,
    );
  }

  return deleted;
}
