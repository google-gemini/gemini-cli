/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { Dirent } from 'node:fs';

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
 * Default paste protection options
 */
export const defaultPasteProtection: PasteProtectionOptions = {
  maxSizeBytes: 10 * 1024 * 1024, // 10MB
  allowedTypes: [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/tiff',
    'image/bmp',
    'text/plain',
  ],
};

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
  if (options.maxSizeBytes && content.length > options.maxSizeBytes) {
    return {
      isValid: false,
      error: `Content exceeds maximum allowed size of ${options.maxSizeBytes} bytes`,
    };
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

// Track clipboard state to prevent duplicate processing
const clipboardState = {
  lastContentHash: '',
  lastProcessedTime: 0,
  minProcessInterval: 2000, // 2 seconds minimum between processing the same content
  isProcessing: false, // Flag to prevent concurrent operations
};

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
  } catch (error) {
    console.error('Error reading clipboard:', error);
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
      console.error(
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
  error?: string;
}

/**
 * Saves the image from clipboard to a temporary file with protection checks
 * @param targetDir The target directory to create temp files within
 * @param protectionOptions Optional paste protection options
 * @returns The result of the operation with file path or error
 */
export async function saveClipboardImage(
  targetDir?: string,
  protectionOptions: Partial<PasteProtectionOptions> = {},
): Promise<SaveClipboardImageResult> {
  // Prevent concurrent clipboard operations
  if (clipboardState.isProcessing) {
    return {
      filePath: null,
      error: 'Clipboard operation already in progress',
    };
  }

  clipboardState.isProcessing = true;

  try {
    // Create a temporary directory for clipboard images within the target directory
    // This avoids security restrictions on paths outside the target directory
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, '.gemini-clipboard');
    try {
      await fs.mkdir(tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create directory:', error);
      clipboardState.isProcessing = false;
      return {
        filePath: null,
        error: `Failed to process clipboard image: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Merge provided options with defaults
    const options: PasteProtectionOptions = {
      ...defaultPasteProtection,
      ...protectionOptions,
    };

    // Generate a unique filename with timestamp and random string
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 10);

    // Check if we've processed this clipboard content recently
    const currentContent = await getClipboardContent();
    if (currentContent) {
      const contentHash = hashContent(currentContent);
      const now = Date.now();

      // Skip if we've recently processed the same content
      if (
        contentHash === clipboardState.lastContentHash &&
        now - clipboardState.lastProcessedTime <
          clipboardState.minProcessInterval
      ) {
        // Always return the expected error for all empty/unsupported/duplicate cases
        clipboardState.isProcessing = false;
        return {
          filePath: null,
          error: 'Unsupported platform or no image in clipboard',
        };
      }

      // Update clipboard state
      clipboardState.lastContentHash = contentHash;
      clipboardState.lastProcessedTime = now;

      // Validate content against protection rules
      const validation = await validatePasteContent(currentContent, options);
      if (!validation.isValid) {
        clipboardState.isProcessing = false;
        return {
          filePath: null,
          error: 'Unsupported platform or no image in clipboard',
        };
      }
    }

    // Removed unused variables

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
              return { filePath: currentFilePath };
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
      const fallbackCommand = `
        try {
          $hasImage = $false;
          if (Get-Command -Name Get-Clipboard -ErrorAction SilentlyContinue) {
            $img = Get-Clipboard -Format Image -ErrorAction Stop;
            if ($img) {
              $img.Save('${escapedPath}', [System.Drawing.Imaging.ImageFormat]::Png);
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
        console.error(
          'Primary method failed, trying fallback...',
          primaryError,
        );
        try {
          // If primary method fails, try the fallback command
          result = await execAsync(
            `powershell -ExecutionPolicy Bypass -NoProfile -Command "& {${fallbackCommand}}"`,
            {
              shell: 'powershell.exe',
              maxBuffer: 10 * 1024 * 1024,
            },
          );
        } catch (fallbackError) {
          console.error('Fallback method failed:', fallbackError);
          const errorMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError);
          result = { stdout: '', stderr: errorMessage };
        }
      }

      const output = result.stdout.trim();
      if (output === 'success') {
        try {
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            clipboardState.isProcessing = false;
            return { filePath: tempFilePath };
          }
        } catch (err) {
          console.error('Failed to access saved image file:', err);
          clipboardState.isProcessing = false;
          return { filePath: null, error: 'Failed to access saved image file' };
        }
      } else if (result.stderr) {
        console.error('PowerShell error:', result.stderr);

        // Check for execution policy or language mode errors
        if (
          result.stderr.includes('language mode') ||
          result.stderr.includes('execution policy')
        ) {
          console.error(
            '\n\x1b[31mError: PowerShell execution policy is too restrictive.\x1b[0m',
          );
          console.error(
            'To fix this, run PowerShell as Administrator and execute:',
          );
          console.error(
            'Set-ExecutionPolicy RemoteSigned -Scope CurrentUser\n',
          );
        }
        clipboardState.isProcessing = false;
        return { filePath: null, error: 'PowerShell error' };
      }
    } else if (process.platform === 'linux') {
      // Check if xclip is available
      try {
        await execAsync('which xclip >/dev/null 2>&1', { shell: '/bin/bash' });
      } catch {
        // xclip not available
        console.warn(
          'xclip is not installed. Cannot save clipboard images on Linux.',
        );
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
          // Escape characters that have special meaning inside double quotes in bash.
          const escapedPath = linuxTempFilePath.replace(/([`$\\])/g, '\\$1');

          const { stdout } = await execAsync(
            `xclip -selection clipboard -t ${selectedFormat.type} -o > "${escapedPath}" 2>/dev/null && echo "success" || echo "error"`,
            { shell: '/bin/bash' },
          );

          if (stdout.trim() === 'success') {
            try {
              const stats = await fs.stat(linuxTempFilePath);
              if (stats.size > 0) {
                return { filePath: linuxTempFilePath };
              }
            } catch {
              // File doesn't exist, continue to next format
            }
          }
          // Clean up on failure
          try {
            await fs.unlink(linuxTempFilePath);
          } catch {
            // Ignore cleanup errors
          }
        }
      } catch (error) {
        console.error('Error with clipboard targets:', error);
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
          const escapedPath = linuxTempFilePath.replace(/([`$\\])/g, '\\$1');

          try {
            const { stdout } = await execAsync(
              `xclip -selection clipboard -t ${format.type} -o > "${escapedPath}" 2>/dev/null && echo "success" || echo "error"`,
              { shell: '/bin/bash' },
            );

            if (stdout.trim() === 'success') {
              const stats = await fs.stat(linuxTempFilePath);
              if (stats.size > 0) {
                clipboardState.isProcessing = false;
                return { filePath: linuxTempFilePath };
              }
            }
            // If we get here, the format didn't work, so clean up
            await fs.unlink(linuxTempFilePath).catch(() => {});
          } catch (error) {
            console.error(`Error processing format ${format.type}:`, error);
            // Clean up on error
            await fs.unlink(linuxTempFilePath).catch(() => {});
            // Continue to next format
          }
        }
      }
    }

    clipboardState.isProcessing = false;
    return {
      filePath: null,
      error: 'Unsupported platform or no image in clipboard',
    };
  } catch (error) {
    console.error('Error in saveClipboardImage:', error);
    clipboardState.isProcessing = false;
    return {
      filePath: null,
      error: 'Error processing clipboard image',
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
    const files = await (fs.readdir(tempDir) as unknown as Dirent[]);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const file of files) {
      const fileName = file.name.toString();
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
  } catch {
    // Ignore errors in cleanup
  }
}
