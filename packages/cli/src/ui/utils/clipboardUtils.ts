/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { quote } from 'shell-quote';

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
 * Saves the image from clipboard to a temporary file (macOS and Windows only)
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

    // Save clipboard image using platform-specific method
    let tempFilePath: string | null = null;
    if (process.platform === 'darwin') {
      tempFilePath = await saveMacOSClipboardImage(tempDir, timestamp);
    } else if (process.platform === 'win32') {
      tempFilePath = await saveWindowsClipboardImage(tempDir, timestamp);
    }

    if (!tempFilePath) {
      return null;
    }

    // Verify file was created and has content
    try {
      const stats = await fs.stat(tempFilePath);
      if (stats.size > 0) {
        return tempFilePath;
      }
    } catch {
      // File doesn't exist or can't be accessed
    }

    // Clean up failed attempt
    try {
      await cleanupFile(tempFilePath);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Warning:', error.message);
      }
      // Continue execution even if cleanup fails
    }
    return null;
  } catch (_error) {
    return null;
  }
}

// Helper function to cleanup file
async function cleanupFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Check if it's a permission error
    if (error instanceof Error && 'code' in error && error.code === 'EACCES') {
      throw new Error(`Permission denied when cleaning up file: ${filePath}`);
    }
    // Silently ignore other cleanup errors:
    // - File might not exist (ENOENT)
    // - Other non-critical I/O errors
  }
}

// Helper function to execute command and handle result
async function executeCommandAndHandleResult(
  command: string,
  tempFilePath: string,
): Promise<string | null> {
  const { stdout } = await execAsync(command);

  if (stdout.trim() === 'success') {
    return tempFilePath;
  }

  // Command failed, clean up temporary file
  try {
    await cleanupFile(tempFilePath);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Warning:', error.message);
    }
  }
  return null;
}

// macOS platform clipboard save implementation
async function saveMacOSClipboardImage(
  tempDir: string,
  timestamp: number,
): Promise<string | null> {
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
    const quotedPath = quote([tempFilePath]);

    const script = `
      try
        set imageData to the clipboard as «class ${format.class}»
        set fileRef to open for access POSIX file ${quotedPath} with write permission
        write imageData to fileRef
        close access fileRef
        return "success"
      on error errMsg
        try
          close access POSIX file ${quotedPath}
        end try
        return "error"
      end try
    `;

    const result = await executeCommandAndHandleResult(
      `osascript -e '${script}'`,
      tempFilePath,
    );

    if (result) {
      return result;
    }
  }

  return null;
}

// Windows platform clipboard save implementation
async function saveWindowsClipboardImage(
  tempDir: string,
  timestamp: number,
): Promise<string | null> {
  const tempFilePath = path.join(tempDir, `clipboard-${timestamp}.png`);
  const quotedPath = quote([tempFilePath]);

  const powershellScript = 
        `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; if ([System.Windows.Forms.Clipboard]::ContainsImage()) { $image = [System.Windows.Forms.Clipboard]::GetImage(); $image.Save(${quotedPath}, [System.Drawing.Imaging.ImageFormat]::Png); Write-Output 'success' } else { Write-Output 'error' }`;
  return await executeCommandAndHandleResult(
    `powershell -command "${powershellScript}"`,
    tempFilePath,
  );
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
