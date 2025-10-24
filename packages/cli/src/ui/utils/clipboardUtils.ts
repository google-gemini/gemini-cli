/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawnAsync } from '@google/gemini-cli-core';

/**
 * Checks if the system clipboard contains an image (supports macOS, Windows, and Linux)
 * @returns true if clipboard contains an image
 */
export async function clipboardHasImage(): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      // macOS: Use osascript to check clipboard type
      const { stdout } = await spawnAsync('osascript', [
        '-e',
        'clipboard info',
      ]);
      const imageRegex =
        /«class PNGf»|TIFF picture|JPEG picture|GIF picture|«class JPEG»|«class TIFF»/;
      return imageRegex.test(stdout);
    } else if (process.platform === 'win32') {
      // Windows: Use PowerShell to check clipboard
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
          Write-Output "true"
        } else {
          Write-Output "false"
        }
      `;
      const { stdout } = await spawnAsync('powershell', [
        '-NoProfile',
        '-Command',
        script,
      ]);
      return stdout.trim() === 'true';
    } else if (process.platform === 'linux') {
      // Linux: Use xclip to check clipboard (requires xclip to be installed)
      try {
        const { stdout } = await spawnAsync('xclip', [
          '-selection',
          'clipboard',
          '-t',
          'TARGETS',
          '-o',
        ]);
        // Check if any image MIME types are available
        return /image\/(png|jpeg|jpg|gif|bmp|tiff)/.test(stdout);
      } catch {
        // Try wl-paste for Wayland
        try {
          const { stdout } = await spawnAsync('wl-paste', ['--list-types']);
          return /image\/(png|jpeg|jpg|gif|bmp|tiff)/.test(stdout);
        } catch {
          return false;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Saves the image from clipboard to a temporary file (supports macOS, Windows, and Linux)
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
      // macOS: Use osascript to save clipboard image
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

        const { stdout } = await spawnAsync('osascript', ['-e', script]);

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
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
          $image = [System.Windows.Forms.Clipboard]::GetImage()
          $image.Save("${tempFilePath.replace(/\\/g, '\\\\')}", [System.Drawing.Imaging.ImageFormat]::Png)
          Write-Output "success"
        } else {
          Write-Output "error"
        }
      `;

      const { stdout } = await spawnAsync('powershell', [
        '-NoProfile',
        '-Command',
        script,
      ]);

      if (stdout.trim() === 'success') {
        // Verify the file was created and has content
        try {
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            return tempFilePath;
          }
        } catch {
          // File doesn't exist
        }
      }
    } else if (process.platform === 'linux') {
      // Linux: Try xclip first, then wl-paste for Wayland
      const formats = [
        { mimeType: 'image/png', extension: 'png' },
        { mimeType: 'image/jpeg', extension: 'jpg' },
        { mimeType: 'image/bmp', extension: 'bmp' },
        { mimeType: 'image/gif', extension: 'gif' },
      ];

      for (const format of formats) {
        const tempFilePath = path.join(
          tempDir,
          `clipboard-${timestamp}.${format.extension}`,
        );

        try {
          // Try xclip (X11)
          await spawnAsync(
            'sh',
            [
              '-c',
              `xclip -selection clipboard -t ${format.mimeType} -o > "${tempFilePath}"`,
            ],
            { shell: true },
          );

          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            return tempFilePath;
          }
        } catch {
          // Try wl-paste (Wayland)
          try {
            await spawnAsync(
              'sh',
              ['-c', `wl-paste --type ${format.mimeType} > "${tempFilePath}"`],
              { shell: true },
            );

            const stats = await fs.stat(tempFilePath);
            if (stats.size > 0) {
              return tempFilePath;
            }
          } catch {
            // Continue to next format
          }
        }

        // Clean up failed attempt
        try {
          await fs.unlink(tempFilePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    // No format worked
    return null;
  } catch (error) {
    console.error('Error saving clipboard image:', error);
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
  } catch {
    // Ignore errors in cleanup
  }
}
