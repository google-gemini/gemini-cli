/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { debugLogger, unescapePath, escapePath } from '@google/gemini-cli-core';

/**
 * Interface for paste protection options
 */
export interface PasteProtectionOptions {
  /** Maximum allowed file size in bytes (for images/files) */
  maxSizeBytes?: number;
  /** Allowed file types (MIME types or extensions) */
  allowedTypes?: string[];
  /** Custom validation function for paste content */
  validateContent?: (content: string) => Promise<boolean> | boolean;
}

/**
 * Allowed MIME types for clipboard content
 */
export const ALLOWED_CLIPBOARD_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/tiff',
  'image/bmp',
  'text/plain',
] as const;

/**
 * Default paste protection options
 */
export const defaultPasteProtection: PasteProtectionOptions = {
  maxSizeBytes: 10 * 1024 * 1024, // 10MB
  allowedTypes: [...ALLOWED_CLIPBOARD_TYPES],
};

/**
 * Supported image file extensions based on Gemini API.
 * See: https://ai.google.dev/gemini-api/docs/image-understanding
 */
export const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.heic',
  '.heif',
];

/** Matches strings that start with a path prefix (/, ~, ., Windows drive letter, or UNC path) */
const PATH_PREFIX_PATTERN = /^([/~.]|[a-zA-Z]:|\\\\)/;

/**
 * Validates clipboard content against protection rules
 * @param content The content to validate
 * @param options Protection options
 * @returns Object with validation result and error message if invalid
 */
export async function validatePasteContent(
  content: string,
  options: PasteProtectionOptions = defaultPasteProtection,
): Promise<{ isValid: boolean; error?: string }> {
  // Check content size if maxSizeBytes is set
  if (options.maxSizeBytes) {
    const byteSize = Buffer.byteLength(content, 'utf8');
    if (byteSize > options.maxSizeBytes) {
      return {
        isValid: false,
        error: `Content exceeds maximum allowed size of ${options.maxSizeBytes} bytes (actual: ${byteSize} bytes)`,
      };
    }
  }

  // Run custom validation if provided
  if (options.validateContent) {
    const customValidation = await Promise.resolve(
      options.validateContent(content),
    );
    if (!customValidation) {
      return {
        isValid: false,
        error: 'Content validation failed',
      };
    }
  }

  return { isValid: true };
}

/**
 * Hashes clipboard content for comparison
 * @param content The content to hash
 * @returns SHA-256 hash of the content
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Track clipboard state to prevent duplicate processing
export const clipboardState = {
  lastContentHash: '',
  lastProcessedTime: 0,
  minProcessInterval: 2000, // 2 seconds minimum between processing the same content
  isProcessing: false, // Flag to prevent concurrent operations
};

/**
 * Acquires a file-based lock to prevent concurrent clipboard operations across processes
 * @param tempDir The temporary directory for clipboard files
 * @returns true if lock acquired, false otherwise
 */
async function acquireLock(tempDir: string): Promise<boolean> {
  const lockFile = path.join(tempDir, 'clipboard.lock');
  try {
    // Check if lock file exists and is recent (within 30 seconds)
    const stats = await fs.stat(lockFile);
    const now = Date.now();
    if (now - stats.mtimeMs < 30000) {
      // Lock is recent, cannot acquire
      return false;
    }
    // Lock is stale, remove it
    await fs.unlink(lockFile);
  } catch {
    // Lock file doesn't exist, proceed
  }

  // Create lock file
  try {
    await fs.writeFile(lockFile, process.pid.toString(), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Releases the file-based lock
 * @param tempDir The temporary directory for clipboard files
 */
async function releaseLock(tempDir: string): Promise<void> {
  const lockFile = path.join(tempDir, 'clipboard.lock');
  try {
    await fs.unlink(lockFile);
  } catch {
    // Ignore errors
  }
}

/**
 * Gets clipboard content in a platform-agnostic way
 * @returns The clipboard content as a string, or null if not available
 */
async function getClipboardContent(): Promise<string | null> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(
        'powershell -Command "Get-Clipboard -Format Text -Raw"',
      );
      return stdout || null;
    } else if (process.platform === 'darwin') {
      const { stdout } = await execAsync('pbpaste');
      return stdout || null;
    } else if (process.platform === 'linux') {
      // Check if xclip is available
      try {
        await execAsync('which xclip');
        const { stdout } = await execAsync(
          'xclip -selection clipboard -o 2>/dev/null',
        );
        return stdout || null;
      } catch {
        // xclip not available, try xsel
        const { stdout } = await execAsync(
          'xsel --clipboard --output 2>/dev/null',
        );
        return stdout || null;
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Checks if the system clipboard contains an image
 * @returns true if clipboard contains an image
 */
export async function clipboardHasImage(): Promise<boolean> {
  if (process.platform === 'darwin') {
    try {
      // Use osascript to check clipboard type
      const { stdout } = await execAsync(
        `osascript -e 'clipboard info' 2>/dev/null | grep -qE "«class PNGf»|«class JPEG»|«class TIFF»|«class GIFf»" && echo "true" || echo "false"`,
        { shell: '/bin/bash' },
      );
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  } else if (process.platform === 'win32') {
    try {
      // Use PowerShell to check if clipboard contains an image
      const { stdout } = await execAsync(
        `powershell -Command "[bool](Get-Clipboard -Format Image -ErrorAction Ignore)"`,
        { shell: 'powershell.exe' },
      );
      return stdout.trim().toLowerCase() === 'true';
    } catch (error) {
      debugLogger.error(
        'Failed to check Windows clipboard for image:',
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  } else if (process.platform === 'linux') {
    try {
      // Check if xclip is available
      try {
        await execAsync('which xclip >/dev/null 2>&1', { shell: '/bin/bash' });
      } catch {
        // xclip not available, cannot detect clipboard images
        return false;
      }

      // Use xclip to check clipboard content type
      const { stdout } = await execAsync(
        `xclip -selection clipboard -t TARGETS -o 2>/dev/null | grep -qE "image/png|image/jpeg|image/gif|image/tiff|image/bmp" && echo "true" || echo "false"`,
        { shell: '/bin/bash' },
      );
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Result of saving a clipboard image
 */
export interface SaveClipboardImageResult {
  filePath: string | null;
  displayName?: string; // User-friendly display name (e.g., "screenshot-1")
  error?: string;
}

/**
 * Saves the image from clipboard to a temporary file with protection checks
 * @param targetDir The target directory to create temp files within
 * @param protectionOptions Optional paste protection options
 * @returns The path to the saved image file, or null if no image or error (backward compatible)
 */
export async function saveClipboardImage(
  targetDir?: string,
  protectionOptions: Partial<PasteProtectionOptions> = {},
): Promise<string | null> {
  const result = await saveClipboardImageDetailed(targetDir, protectionOptions);
  return result.filePath;
}

/**
 * Saves the image from clipboard to a temporary file with protection checks (detailed result)
 * @param targetDir The target directory to create temp files within
 * @param protectionOptions Optional paste protection options
 * @returns The detailed result of the operation with file path, display name, or error
 */
export async function saveClipboardImageDetailed(
  targetDir?: string,
  protectionOptions: Partial<PasteProtectionOptions> = {},
): Promise<SaveClipboardImageResult> {
  // Validate targetDir for security
  if (targetDir) {
    if (!path.isAbsolute(targetDir)) {
      return {
        filePath: null,
        error: 'targetDir must be an absolute path',
      };
    }
    // Ensure it's within the current working directory to prevent path traversal
    const cwd = process.cwd();
    if (!path.resolve(targetDir).startsWith(path.resolve(cwd))) {
      return {
        filePath: null,
        error: 'targetDir must be within the current working directory',
      };
    }
  }

  const baseDir = targetDir || process.cwd();
  const tempDir = path.join(baseDir, '.gemini-clipboard');
  try {
    await fs.mkdir(tempDir, { recursive: true });
  } catch (error) {
    debugLogger.error('Failed to create directory:', error);
    return {
      filePath: null,
      error: 'Failed to process clipboard image: Failed to create directory',
    };
  }

  // Acquire file-based lock to prevent cross-process concurrency
  if (!(await acquireLock(tempDir))) {
    return {
      filePath: null,
      error: 'Clipboard operation already in progress (another process)',
    };
  }

  clipboardState.isProcessing = true;

  try {
    // Merge provided options with defaults
    const options: PasteProtectionOptions = {
      ...defaultPasteProtection,
      ...protectionOptions,
    };

    // Generate a friendly display name and unique filename
    const imageCount = (await fs.readdir(tempDir).catch(() => [])).length + 1;
    const displayName = `screenshot-${imageCount}`;
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);

    // Check if we've processed this clipboard content recently
    const hasImage = await clipboardHasImage();
    let contentHash: string | null = null;
    const now = Date.now();

    if (hasImage) {
      // For images, get the hash of the image data
      if (process.platform === 'darwin') {
        try {
          const { stdout } = await execAsync(
            `osascript -e 'the clipboard as «class PNGf»'`,
            { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 },
          );
          contentHash = crypto
            .createHash('sha256')
            .update(stdout)
            .digest('hex');
        } catch {
          // Try other formats if PNG fails
          const formats = ['JPEG', 'TIFF', 'GIFf'];
          for (const format of formats) {
            try {
              const { stdout } = await execAsync(
                `osascript -e 'the clipboard as «class ${format}»'`,
                { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 },
              );
              contentHash = crypto
                .createHash('sha256')
                .update(stdout)
                .digest('hex');
              break;
            } catch {
              // Continue to next format
            }
          }
        }
      } else if (process.platform === 'win32') {
        try {
          // Use PowerShell to get image data and hash
          const { stdout } = await execAsync(
            `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img) { $ms = New-Object System.IO.MemoryStream; $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bytes = $ms.ToArray(); $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes); [BitConverter]::ToString($hash).Replace('-', '').ToLower() } else { '' }"`,
            { shell: 'powershell.exe', maxBuffer: 10 * 1024 * 1024 },
          );
          if (stdout.trim()) {
            contentHash = stdout.trim();
          }
        } catch {
          // Ignore errors
        }
      } else if (process.platform === 'linux') {
        try {
          // Use xclip to get image data and hash
          const { stdout } = await execAsync(
            `xclip -selection clipboard -t image/png -o | sha256sum | awk '{print $1}'`,
            { shell: '/bin/bash', maxBuffer: 10 * 1024 * 1024 },
          );
          contentHash = stdout.trim();
        } catch {
          // Ignore errors
        }
      }
    } else {
      // For text content
      const currentContent = await getClipboardContent();
      if (currentContent) {
        contentHash = hashContent(currentContent);
      }
    }

    if (contentHash) {
      // Skip if we've recently processed the same content
      if (
        contentHash &&
        contentHash === clipboardState.lastContentHash &&
        now - (clipboardState.lastProcessedTime || 0) <
          clipboardState.minProcessInterval
      ) {
        // Always return the expected error for all empty/unsupported/duplicate cases
        clipboardState.isProcessing = false;
        await releaseLock(tempDir);
        return {
          filePath: null,
          error: 'Unsupported platform or no image in clipboard',
        };
      }

      // Update clipboard state
      clipboardState.lastContentHash = contentHash;
      clipboardState.lastProcessedTime = now;

      // For images, skip text validation since we don't have text content
      if (!hasImage) {
        // Validate content against protection rules
        const currentContent = await getClipboardContent();
        if (currentContent) {
          const validation = await validatePasteContent(
            currentContent,
            options,
          );
          if (!validation.isValid) {
            clipboardState.isProcessing = false;
            await releaseLock(tempDir);
            return {
              filePath: null,
              error: validation.error || 'Content validation failed',
            };
          }
        }
      }
    }

    if (process.platform === 'darwin') {
      // Try different image formats in order of preference
      const formats = [
        { class: 'PNGf', extension: 'png' },
        { class: 'JPEG', extension: 'jpg' },
        { class: 'TIFF', extension: 'tiff' },
        { class: 'GIFf', extension: 'gif' },
      ];

      for (const format of formats) {
        const currentFilePath = path.join(
          tempDir,
          `clipboard-${timestamp}-${randomString}.${format.extension}`,
        );

        // Try to save clipboard as this format
        const escapedTempFilePath = currentFilePath
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"');
        const script = `
          try
            set imageData to the clipboard as «class ${format.class}»
            set fileRef to open for access POSIX file "${escapedTempFilePath}" with write permission
            write imageData to fileRef
            close access fileRef
            set result to "success"
          on error errMsg
            try
              close access POSIX file "${escapedTempFilePath}"
              do shell script "rm -f " & quoted form of "${escapedTempFilePath}"
            end try
            set result to "error: " & errMsg
          end try
          return result
        `;

        const { stdout } = await execAsync(`osascript -e '${script}'`);
        const result = stdout.trim();

        if (result === 'success') {
          // Verify the file was created and has content
          try {
            const stats = await fs.stat(currentFilePath);
            if (stats.size > 0) {
              clipboardState.isProcessing = false;
              await releaseLock(tempDir);
              return { filePath: currentFilePath, displayName };
            }
          } catch {
            // File doesn't exist, continue to next format
          }
        }

        // Clean up failed attempt
        try {
          await fs.unlink(currentFilePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    } else if (process.platform === 'win32') {
      // Use PowerShell to save clipboard image
      const tempFilePath = path.join(
        tempDir,
        `clipboard-${timestamp}-${randomString}.png`,
      );
      // In PowerShell, a single quote within a single-quoted string is escaped by doubling it.
      const escapedPath = tempFilePath.replace(/'/g, "''");
      // First try with the standard approach
      const powershellCommand = `
        try {
          Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop;
          if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
            $img = [System.Windows.Forms.Clipboard]::GetImage();
            if ($img) {
              $img.Save('${escapedPath}', [System.Drawing.Imaging.ImageFormat]::Png);
              "success";
              exit 0;
            }
          }
          "no_image";
          exit 0;
        } catch {
          Write-Error $_.Exception.Message;
          exit 1;
        }
      `;

      // Fallback command that doesn't require Add-Type
      const fallbackCmdTemplate = `
        param([string]$outputPath)
        try {
          $hasImage = $false;
          if (Get-Command -Name Get-Clipboard -ErrorAction SilentlyContinue) {
            $img = Get-Clipboard -Format Image -ErrorAction Stop;
            if ($img) {
              $img.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png);
              $hasImage = $true;
            }
          }
          if ($hasImage) {
            "success";
          } else {
            "no_image";
          }
          exit 0;
        } catch {
          Write-Error $_.Exception.Message;
          exit 1;
        }
      `;

      // Try the primary method first
      let result = { stdout: '', stderr: '' };

      try {
        // First try with the standard approach
        result = await execAsync(
          `powershell -ExecutionPolicy Bypass -NoProfile -Command "& {${powershellCommand}}"`,
          {
            shell: 'powershell.exe',
            maxBuffer: 10 * 1024 * 1024,
          },
        );
      } catch (primaryError) {
        debugLogger.error(
          'Primary method failed, trying fallback...',
          primaryError,
        );
        const fallbackScriptPath = path.join(
          tempDir,
          `clipboard-fallback-${timestamp}-${randomString}.ps1`,
        );
        try {
          await fs.writeFile(fallbackScriptPath, fallbackCmdTemplate, 'utf8');
          result = await new Promise<{ stdout: string; stderr: string }>(
            (resolve, reject) => {
              execFile(
                'powershell.exe',
                [
                  '-ExecutionPolicy',
                  'Bypass',
                  '-NoProfile',
                  '-File',
                  fallbackScriptPath,
                  '-outputPath',
                  tempFilePath,
                ],
                { maxBuffer: 10 * 1024 * 1024 },
                (error, stdout, stderr) => {
                  if (error) {
                    reject(error);
                  } else {
                    resolve({ stdout, stderr });
                  }
                },
              );
            },
          );
        } catch (fallbackError) {
          debugLogger.error('Fallback method failed:', fallbackError);
          const errorMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError);
          result = { stdout: '', stderr: errorMessage };
        } finally {
          // Ensure temporary script file is always cleaned up.
          try {
            await fs.unlink(fallbackScriptPath);
          } catch {
            // Ignore errors when cleaning up temporary file
          }
        }
      }

      const output = result.stdout.trim();
      if (output === 'success') {
        try {
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            clipboardState.isProcessing = false;
            await releaseLock(tempDir);
            return { filePath: tempFilePath, displayName };
          }
        } catch (err) {
          debugLogger.error('Failed to access saved image file:', err);
          clipboardState.isProcessing = false;
          await releaseLock(tempDir);
          return { filePath: null, error: 'Failed to access saved image file' };
        }
      } else if (result.stderr) {
        debugLogger.error('PowerShell error:', result.stderr);

        // Check for execution policy or language mode errors
        if (
          result.stderr.includes('language mode') ||
          result.stderr.includes('execution policy')
        ) {
          debugLogger.error(
            '\n\x1b[31mError: PowerShell execution policy is too restrictive.\x1b[0m',
          );
          debugLogger.error(
            'To fix this, run PowerShell as Administrator and execute:',
          );
          debugLogger.error(
            'Set-ExecutionPolicy RemoteSigned -Scope CurrentUser\n',
          );
        }
        clipboardState.isProcessing = false;
        await releaseLock(tempDir);
        return { filePath: null, error: 'PowerShell error' };
      }
    } else if (process.platform === 'linux') {
      // Check if xclip is available
      try {
        await execAsync('which xclip >/dev/null 2>&1', { shell: '/bin/bash' });
      } catch {
        // xclip not available
        debugLogger.warn(
          'xclip is not installed. Cannot save clipboard images on Linux.',
        );
        clipboardState.isProcessing = false;
        await releaseLock(tempDir);
        return { filePath: null, error: 'xclip is not installed' };
      }

      // Use xclip to save clipboard image
      // First, get available image formats from clipboard
      try {
        const { stdout: targetsOutput } = await execAsync(
          'xclip -selection clipboard -t TARGETS -o 2>/dev/null',
          { shell: '/bin/bash' },
        );

        const availableTargets = targetsOutput
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('image/'));

        // Define format preferences in order
        const formatPreferences = [
          { type: 'image/png', extension: 'png' },
          { type: 'image/jpeg', extension: 'jpg' },
          { type: 'image/gif', extension: 'gif' },
          { type: 'image/tiff', extension: 'tiff' },
          { type: 'image/bmp', extension: 'bmp' },
        ];

        // Find the best available format
        let selectedFormat = null;
        for (const pref of formatPreferences) {
          if (availableTargets.includes(pref.type)) {
            selectedFormat = pref;
            break;
          }
        }

        // If no preferred format is available, use the first available image format
        if (!selectedFormat && availableTargets.length > 0) {
          const firstImageTarget = availableTargets[0];
          const extension = firstImageTarget.split('/')[1] || 'png'; // fallback to png
          selectedFormat = { type: firstImageTarget, extension };
        }

        if (selectedFormat) {
          const randomNum = Math.floor(Math.random() * 10000);
          const linuxTempFilePath = path.join(
            tempDir,
            `clipboard-${Date.now()}-${randomNum}.${selectedFormat.extension}`,
          );

          try {
            // First, get the clipboard content as a Buffer
            const { stdout: clipboardData } = await execFileAsync(
              'xclip',
              ['-selection', 'clipboard', '-t', selectedFormat.type, '-o'],
              { encoding: 'buffer' },
            );

            // Write the buffer directly without encoding
            await writeFile(linuxTempFilePath, clipboardData);

            // Verify the file was created and has content
            const stats = await fs.stat(linuxTempFilePath);
            if (stats.size > 0) {
              clipboardState.isProcessing = false;
              await releaseLock(tempDir);
              return { filePath: linuxTempFilePath, displayName };
            }
          } catch (error) {
            // Continue to next format on error
            debugLogger.debug(
              `Clipboard read failed for type ${selectedFormat.type}:`,
              error,
            );
          }
          // If we get here, the format didn't work, so clean up
          await fs.unlink(linuxTempFilePath).catch(() => {});
        }
      } catch (error) {
        debugLogger.error('Error with clipboard targets:', error);
        // Fallback to original approach if getting targets fails
        // xclip availability already checked above
        const formats = [
          { type: 'image/png', extension: 'png' },
          { type: 'image/jpeg', extension: 'jpg' },
          { type: 'image/gif', extension: 'gif' },
          { type: 'image/tiff', extension: 'tiff' },
        ];

        for (const format of formats) {
          const randomNum = Math.floor(Math.random() * 10000);
          const linuxTempFilePath = path.join(
            tempDir,
            `clipboard-${Date.now()}-${randomNum}.${format.extension}`,
          );

          try {
            // First, get the clipboard content as a Buffer
            const { stdout: clipboardData } = await execFileAsync(
              'xclip',
              ['-selection', 'clipboard', '-t', format.type, '-o'],
              { encoding: 'buffer' },
            );

            // Write the buffer directly without encoding
            await writeFile(linuxTempFilePath, clipboardData);

            // Verify the file was created and has content
            const stats = await fs.stat(linuxTempFilePath);
            if (stats.size > 0) {
              clipboardState.isProcessing = false;
              await releaseLock(tempDir);
              return { filePath: linuxTempFilePath, displayName };
            }
          } catch (error) {
            // Continue to next format on error
            debugLogger.debug(
              `Clipboard read failed for type ${format.type}:`,
              error,
            );
          }
          // If we get here, the format didn't work, so clean up
          await fs.unlink(linuxTempFilePath).catch(() => {});
        }
      }
    }

    clipboardState.isProcessing = false;
    await releaseLock(tempDir);
    return {
      filePath: null,
      error: 'Unsupported platform or no image in clipboard',
    };
  } catch (error) {
    debugLogger.error('Error in saveClipboardImage:', error);
    clipboardState.isProcessing = false;
    await releaseLock(tempDir);
    return {
      filePath: null,
      error: 'Unsupported platform or no image in clipboard',
    };
  }
}

/**
 * Cleans up old temporary clipboard image files
 * Removes files older than 1 hour
 * @param targetDir The target directory where temp files are stored
 */
export async function cleanupOldClipboardImages(
  targetDir?: string,
): Promise<void> {
  try {
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, '.gemini-clipboard');
    const files = await fs.readdir(tempDir);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const file of files) {
      const fileName = file;
      if (
        fileName.startsWith('clipboard-') &&
        (fileName.endsWith('.png') ||
          fileName.endsWith('.jpg') ||
          fileName.endsWith('.tiff') ||
          fileName.endsWith('.gif'))
      ) {
        const filePath = path.join(tempDir, fileName);
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < oneHourAgo) {
          await fs.unlink(filePath);
        }
      }
    }
  } catch (e) {
    // Ignore errors in cleanup
    debugLogger.debug('Failed to clean up old clipboard images:', e);
  }
}

/**
 * Splits text into individual path segments, respecting escaped spaces.
 * Unescaped spaces act as separators between paths, while "\ " is preserved
 * as part of a filename.
 *
 * Example: "/img1.png /path/my\ image.png" → ["/img1.png", "/path/my\ image.png"]
 *
 * @param text The text to split
 * @returns Array of path segments (still escaped)
 */
export function splitEscapedPaths(text: string): string[] {
  const paths: string[] = [];
  let current = '';
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (char === '\\' && i + 1 < text.length && text[i + 1] === ' ') {
      // Escaped space - part of filename, preserve the escape sequence
      current += '\\ ';
      i += 2;
    } else if (char === ' ') {
      // Unescaped space - path separator
      if (current.trim()) {
        paths.push(current.trim());
      }
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }

  // Don't forget the last segment
  if (current.trim()) {
    paths.push(current.trim());
  }

  return paths;
}

/**
 * Processes pasted text containing file paths, adding @ prefix to valid paths.
 * Handles both single and multiple space-separated paths.
 *
 * @param text The pasted text (potentially space-separated paths)
 * @param isValidPath Function to validate if a path exists/is valid
 * @returns Processed string with @ prefixes on valid paths, or null if no valid paths
 */
export function parsePastedPaths(
  text: string,
  isValidPath: (path: string) => boolean,
): string | null {
  // First, check if the entire text is a single valid path
  if (PATH_PREFIX_PATTERN.test(text) && isValidPath(text)) {
    return `@${escapePath(text)} `;
  }

  // Otherwise, try splitting on unescaped spaces
  const segments = splitEscapedPaths(text);
  if (segments.length === 0) {
    return null;
  }

  let anyValidPath = false;
  const processedPaths = segments.map((segment) => {
    // Quick rejection: skip segments that can't be paths
    if (!PATH_PREFIX_PATTERN.test(segment)) {
      return segment;
    }
    const unescaped = unescapePath(segment);
    if (isValidPath(unescaped)) {
      anyValidPath = true;
      return `@${segment}`;
    }
    return segment;
  });

  return anyValidPath ? processedPaths.join(' ') + ' ' : null;
}
