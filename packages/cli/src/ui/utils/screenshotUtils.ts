/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
// No longer using uuid

const execAsync = promisify(exec);

/**
 * Takes a screenshot and saves it to the specified directory
 * @param targetDir Directory to save the screenshot
 * @returns Path to the saved screenshot or null if failed
 */
export async function takeScreenshot(
  targetDir: string,
): Promise<{ filePath: string; displayName: string } | null> {
  try {
    // Create target directory if it doesn't exist
    await fs.mkdir(targetDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `screenshot-${timestamp}.png`;
    const filePath = path.join(targetDir, fileName);
    const displayName = `screenshot-${timestamp.split('T')[0]}`;

    if (process.platform === 'darwin') {
      // macOS - escape double quotes for shell
      // Escape backslashes first, then double quotes
      const safePath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await execAsync(`screencapture -x "${safePath}"`);
    } else if (process.platform === 'win32') {
      // Windows - escape single quotes for PowerShell
      const safePath = filePath.replace(/'/g, "''");
      await execAsync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{PRTSC}'); $image = [System.Windows.Forms.Clipboard]::GetImage(); if ($image) { $image.Save('${safePath}', [System.Drawing.Imaging.ImageFormat]::Png) }"`,
      );
    } else if (process.platform === 'linux') {
      // Linux - requires scrot or gnome-screenshot
      try {
        await execAsync(`gnome-screenshot -f "${filePath}"`);
      } catch {
        await execAsync(`scrot -s "${filePath}"`);
      }
    } else {
      console.error('Screenshot not supported on this platform');
      return null;
    }

    // Verify the file was created
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > 0) {
        return { filePath, displayName };
      }
    } catch {
      // File doesn't exist or is empty
    }

    console.error('Failed to capture screenshot');
    return null;
  } catch (error) {
    console.error('Error taking screenshot:', error);
    return null;
  }
}

/**
 * Copies an image file to the clipboard
 * @param filePath Path to the image file
 */
export async function copyImageToClipboard(filePath: string): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      // Escape double quotes and backslashes for AppleScript
      const safePath = filePath.replace(/[\\"]/g, '\\$&');
      await execAsync(
        `osascript -e 'set the clipboard to (read (POSIX file "${safePath}") as {«class PNGf», picture} as alias)'`,
      );
      return true;
    } else if (process.platform === 'win32') {
      // Escape single quotes for PowerShell
      const safePath = filePath.replace(/'/g, "''");
      await execAsync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${safePath}'))"`,
      );
      return true;
    } else if (process.platform === 'linux') {
      // Escape double quotes and backslashes for shell
      const safePath = filePath.replace(/(["$`\\])/g, '\\$1');
      await execAsync(
        `xclip -selection clipboard -t image/png -i "${safePath}"`,
      );
      return true;
    }
    console.warn('Clipboard copy not supported on this platform');
    return false;
  } catch (error) {
    console.error('Error copying image to clipboard:', error);
    return false;
  }
}

/**
 * Takes a screenshot and adds it to the message
 * @param targetDir Directory to save the screenshot
 * @returns Markdown link to the screenshot or null if failed
 */
export async function takeAndAddScreenshot(
  targetDir: string,
): Promise<string | null> {
  const result = await takeScreenshot(targetDir);
  if (!result) return null;

  const relativePath = path.relative(process.cwd(), result.filePath);
  return `[${result.displayName}](@${relativePath})`;
}
