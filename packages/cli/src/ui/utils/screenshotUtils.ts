/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { debugLogger } from '@google/gemini-cli-core';
// No longer using uuid

const execFileAsync = promisify(execFile);

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
      // macOS
      await execFileAsync('screencapture', ['-x', filePath]);
    } else if (process.platform === 'win32') {
      // Windows - use PowerShell with path as argument to avoid injection
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          'powershell.exe',
          [
            '-Command',
            `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{PRTSC}'); $image = [System.Windows.Forms.Clipboard]::GetImage(); if ($image) { $image.Save($args[0], [System.Drawing.Imaging.ImageFormat]::Png) }`,
            filePath,
          ],
          { stdio: 'inherit' },
        );
        child.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`PowerShell exited with code ${code}`));
          }
        });
        child.on('error', reject);
      });
    } else if (process.platform === 'linux') {
      // Linux - requires scrot or gnome-screenshot
      try {
        await execFileAsync('gnome-screenshot', ['-f', filePath]);
      } catch {
        await execFileAsync('scrot', ['-s', filePath]);
      }
    } else {
      debugLogger.error('Screenshot not supported on this platform');
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

    debugLogger.error('Failed to capture screenshot');
    return null;
  } catch (error) {
    debugLogger.error('Error taking screenshot:', error);
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
      // macOS - use osascript with environment variable to avoid shell interpretation
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          'osascript',
          [
            '-e',
            'set the clipboard to (read (POSIX file (system attribute "IMAGE_PATH")) as {«class PNGf», picture} as alias)',
          ],
          {
            env: { ...process.env, IMAGE_PATH: filePath },
            stdio: 'inherit',
          },
        );
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`osascript exited with code ${code}`));
        });
        child.on('error', reject);
      });
      return true;
    } else if (process.platform === 'win32') {
      // Windows - use PowerShell with path as argument to prevent injection
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          'powershell.exe',
          [
            '-Command',
            'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile($args[0]))',
            filePath,
          ],
          { stdio: 'inherit' },
        );
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`PowerShell exited with code ${code}`));
        });
        child.on('error', reject);
      });
      return true;
    } else if (process.platform === 'linux') {
      // Linux - use execFile to avoid shell interpretation
      await execFileAsync('xclip', [
        '-selection',
        'clipboard',
        '-t',
        'image/png',
        '-i',
        filePath,
      ]);
      return true;
    }
    debugLogger.log('Clipboard copy not supported on this platform');
    return false;
  } catch (error) {
    debugLogger.error('Error copying image to clipboard:', error);
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
