/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Checks if the system clipboard contains an image (macOS only for now)
 * @returns true if clipboard contains an image
 */
export async function clipboardHasImage(): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      // macOS: Use osascript to check clipboard type
      const { stdout } = await execAsync(
        `osascript -e 'clipboard info' 2>/dev/null | grep -qE "«class PNGf»|TIFF picture|JPEG picture|GIF picture|«class JPEG»|«class TIFF»" && echo "true" || echo "false"`,
        { shell: '/bin/bash' },
      );
      const result = stdout.trim() === 'true';
      return result;
    } else if (process.platform === 'win32') {
      // Windows: Use PowerShell to check clipboard for image
      const { stdout } = await execAsync(
        `powershell -command "Add-Type -AssemblyName System.Windows.Forms; if ([System.Windows.Forms.Clipboard]::ContainsImage()) { Write-Output 'true' } else { Write-Output 'false' }"`,
      );
      const result = stdout.trim() === 'true';
      return result;
    } else {
      // Other platforms not supported yet
      return false;
    }
  } catch (_error) {
    return false;
  }
}

/**
 * Saves the image from clipboard to a temporary file (macOS only for now)
 * @param targetDir The target directory to create temp files within
 * @returns The path to the saved image file, or null if no image or error
 */
export async function saveClipboardImage(
  targetDir?: string,
): Promise<string | null> {
  try {
    // Create a temporary directory for clipboard images within the target directory
    // This avoids security restrictions on paths outside the target directory
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, '.gemini-clipboard');
    await fs.mkdir(tempDir, { recursive: true });

    // Generate a unique filename with timestamp
    const timestamp = new Date().getTime();

    if (process.platform === 'darwin') {
      // macOS: Use AppleScript to save clipboard image
      const formats = [
        { class: 'PNGf', extension: 'png' },
        { class: 'JPEG', extension: 'jpg' },
        { class: 'TIFF', extension: 'tiff' },
        { class: 'GIFf', extension: 'gif' },
      ];

      for (const format of formats) {
        const tempFilePath = path.join(
          tempDir,
          `clipboard-${timestamp}.${format.extension}`,
        );

        // Try to save clipboard as this format
        const script = `
        try
          set imageData to the clipboard as «class ${format.class}»
          set fileRef to open for access POSIX file "${tempFilePath}" with write permission
          write imageData to fileRef
          close access fileRef
          return "success"
        on error errMsg
          try
            close access POSIX file "${tempFilePath}"
          end try
          return "error"
        end try
      `;

        const { stdout } = await execAsync(`osascript -e '${script}'`);

        if (stdout.trim() === 'success') {
          // Verify the file was created and has content
          try {
            const stats = await fs.stat(tempFilePath);
            if (stats.size > 0) {
              return tempFilePath;
            }
          } catch {
            // File doesn't exist, continue to next format
          }
        }

        // Clean up failed attempt
        try {
          await fs.unlink(tempFilePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    } else if (process.platform === 'win32') {
      // Windows: Use PowerShell to save clipboard image
      const tempFilePath = path.join(tempDir, `clipboard-${timestamp}.png`);

      // Use a different approach to avoid quote escaping issues
      const escapedPath = tempFilePath
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '`"');

      const { stdout } = await execAsync(
        `powershell -command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; if ([System.Windows.Forms.Clipboard]::ContainsImage()) { $image = [System.Windows.Forms.Clipboard]::GetImage(); $image.Save('${escapedPath}', [System.Drawing.Imaging.ImageFormat]::Png); Write-Output 'success' } else { Write-Output 'error' }"`,
      );

      if (stdout.trim() === 'success') {
        // Verify the file was created and has content
        try {
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            return tempFilePath;
          }
        } catch (_statError) {
          // File doesn't exist
        }
      }

      // Clean up failed attempt
      try {
        await fs.unlink(tempFilePath);
      } catch (_unlinkError) {
        // Ignore cleanup errors
      }
    } else {
      // Other platforms not supported yet
      return null;
    }

    // No format worked
    return null;
  } catch (_error) {
    return null;
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
      if (
        file.startsWith('clipboard-') &&
        (file.endsWith('.png') ||
          file.endsWith('.jpg') ||
          file.endsWith('.tiff') ||
          file.endsWith('.gif'))
      ) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < oneHourAgo) {
          await fs.unlink(filePath);
        }
      }
    }
  } catch (_error) {
    // Ignore errors in cleanup
  }
}
