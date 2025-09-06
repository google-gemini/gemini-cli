/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const execAsync = promisify(exec);

/**
 * Checks if the system clipboard contains an image
 * @returns true if clipboard contains an image
 */
export async function clipboardHasImage(): Promise<boolean> {
  if (process.platform === 'darwin') {
    try {
      // Use osascript to check clipboard type
      const { stdout } = await execAsync(
        `osascript -e 'clipboard info' 2>/dev/null | grep -qE "«class PNGf»|TIFF picture|JPEG picture|GIF picture|«class JPEG»|«class TIFF»" && echo "true" || echo "false"`,
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
        `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::ContainsImage()"`,
        { shell: 'powershell.exe' },
      );
      return stdout.trim().toLowerCase() === 'true';
    } catch {
      return false;
    }
  } else if (process.platform === 'linux') {
    try {
      // Use xclip to check clipboard content type
      const { stdout } = await execAsync(
        `xclip -selection clipboard -t TARGETS -o 2>/dev/null | grep -qE "image/png|image/jpeg|image/gif|image/tiff" && echo "true" || echo "false"`,
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
 * Saves the image from clipboard to a temporary file
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

    // Generate a unique filename with counter
    let counter = 1;
    try {
      const files = await fs.readdir(tempDir);
      const clipboardFiles = files.filter(
        (f) => f.startsWith('clipboard-') && f.match(/clipboard-(\d+)\./),
      );
      if (clipboardFiles.length > 0) {
        const numbers = clipboardFiles.map((f) => {
          const match = f.match(/clipboard-(\d+)\./);
          return match ? parseInt(match[1], 10) : 0;
        });
        counter = Math.max(...numbers) + 1;
      }
    } catch {
      // Directory doesn't exist yet or can't read, use counter 1
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
        const tempFilePath = path.join(
          tempDir,
          `clipboard-${counter}.${format.extension}`,
        );

        // Try to save clipboard as this format
        const escapedTempFilePath = tempFilePath
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"');
        const script = `
           try
            set imageData to the clipboard as «class ${format.class}»
            set fileRef to open for access POSIX file "${escapedTempFilePath}" with write permission
            write imageData to fileRef
            close access fileRef
            return "success"
          on error errMsg
            try
              close access POSIX file "${escapedTempFilePath}"
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
      // Use PowerShell to save clipboard image
      const tempFilePath = path.join(tempDir, `clipboard-${counter}.png`);
      // In PowerShell, a single quote within a single-quoted string is escaped by doubling it.
      const escapedPath = tempFilePath.replace(/'/g, "''");
      const powershellCommand = `
        Add-Type -AssemblyName System.Windows.Forms;
        Add-Type -AssemblyName System.Drawing;
        $img = [System.Windows.Forms.Clipboard]::GetImage();
        if ($img) {
          $img.Save('${escapedPath}', [System.Drawing.Imaging.ImageFormat]::Png);
          Write-Host "success";
        } else {
          Write-Host "no_image";
        }
      `;

      const { stdout } = await execAsync(
        `powershell -command "${powershellCommand}"`,
        {
          shell: 'powershell.exe',
        },
      );

      if (stdout.trim() === 'success') {
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
      // Use xclip to save clipboard image
      const tempFilePath = path.join(tempDir, `clipboard-${counter}.png`);
      // Escape characters that have special meaning inside double quotes in bash.
      const escapedPath = tempFilePath.replace(/(["`$\\])/g, '\\$1');
      const { stdout } = await execAsync(
        `xclip -selection clipboard -t image/png -o > "${escapedPath}" 2>/dev/null && echo "success" || echo "error"`,
        { shell: '/bin/bash' },
      );

      if (stdout.trim() === 'success') {
        try {
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            return tempFilePath;
          }
        } catch {
          // File doesn't exist
        }
      }
    }

    // No format worked or unsupported platform
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
