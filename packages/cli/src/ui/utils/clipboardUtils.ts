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
      console.log('Attempting to access clipboard using primary method...');
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
        console.log('Primary method result:', result);
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
          console.log('Fallback method result:', result);
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
            return tempFilePath;
          }
        } catch (err) {
          console.error('Failed to access saved image file:', err);
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
      }
    } else if (process.platform === 'linux') {
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
          const linuxTempFilePath = path.join(
            tempDir,
            `clipboard-${counter}.${selectedFormat.extension}`,
          );
          // Escape characters that have special meaning inside double quotes in bash.
          const escapedPath = linuxTempFilePath.replace(/([`$\\])/g, '\\$1');

          const { stdout } = await execAsync(
            `xclip -selection clipboard -t ${selectedFormat.type} -o > "${escapedPath}" 2>/dev/null && echo "success" || echo "error"`,
            { shell: '/bin/bash' },
          );

          if (stdout.trim() === 'success') {
            const stats = await fs.stat(linuxTempFilePath);
            if (stats.size > 0) {
              return linuxTempFilePath;
            }
          }
          // Clean up on failure
          await fs.unlink(linuxTempFilePath).catch(() => {
            /* ignore */
          });
        }
      } catch {
        // Fallback to original approach if getting targets fails
        const formats = [
          { type: 'image/png', extension: 'png' },
          { type: 'image/jpeg', extension: 'jpg' },
          { type: 'image/gif', extension: 'gif' },
          { type: 'image/tiff', extension: 'tiff' },
        ];

        for (const format of formats) {
          const linuxTempFilePath = path.join(
            tempDir,
            `clipboard-${counter}.${format.extension}`,
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
                return linuxTempFilePath;
              }
            }
            await fs.unlink(linuxTempFilePath).catch(() => {
              /* ignore */
            });
          } catch {
            // Ignore errors and try next format
          }
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
