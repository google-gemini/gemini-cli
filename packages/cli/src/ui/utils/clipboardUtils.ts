/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { debugLogger, spawnAsync } from '@google/gemini-cli-core';
import Clipboard from '@crosscopy/clipboard';

/**
 * Detects if the system is running in WSL (Windows Subsystem for Linux)
 * @returns true if running in WSL
 */
function isWSL(): boolean {
  try {
    if (process.platform !== 'linux') {
      return false;
    }
    // Check for WSL-specific indicators
    const releaseInfo = readFileSync('/proc/version', 'utf8');
    return releaseInfo.toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

/**
 * Checks if PowerShell is available (for WSL)
 * @returns path to powershell.exe or null if not available
 */
async function getPowerShellPath(): Promise<string | null> {
  try {
    // Try pwsh.exe first (PowerShell 7+)
    const { stdout: pwshPath } = await spawnAsync('which', ['pwsh.exe']);
    if (pwshPath.trim()) {
      return 'pwsh.exe';
    }
  } catch {
    // pwsh.exe not found
  }

  try {
    // Try powershell.exe (Windows PowerShell)
    const { stdout: psPath } = await spawnAsync('which', ['powershell.exe']);
    if (psPath.trim()) {
      return 'powershell.exe';
    }
  } catch {
    // powershell.exe not found
  }

  return null;
}

/**
 * Checks if clipboard has image using PowerShell (WSL)
 * @returns true if clipboard contains an image
 */
async function wslClipboardHasImage(): Promise<boolean> {
  try {
    const powershell = await getPowerShellPath();
    if (!powershell) {
      debugLogger.warn('PowerShell not found in WSL');
      return false;
    }

    const script = `
      Add-Type -AssemblyName System.Windows.Forms;
      [System.Windows.Forms.Clipboard]::ContainsImage()
    `;

    const { stdout } = await spawnAsync(powershell, [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ]);

    return stdout.trim().toLowerCase() === 'true';
  } catch (error) {
    debugLogger.warn('Error checking WSL clipboard for image:', error);
    return false;
  }
}

/**
 * Saves clipboard image using PowerShell (WSL)
 * @param targetDir The target directory to save the image
 * @returns The path to the saved image file, or null on error
 */
async function wslSaveClipboardImage(
  targetDir?: string,
): Promise<string | null> {
  try {
    const powershell = await getPowerShellPath();
    if (!powershell) {
      debugLogger.warn('PowerShell not found in WSL');
      return null;
    }

    // Create temp directory in WSL
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, '.gemini-clipboard');
    await fs.mkdir(tempDir, { recursive: true });

    // Generate unique filename
    const timestamp = new Date().getTime();
    const wslPath = path.join(tempDir, `clipboard-${timestamp}.png`);

    // Convert WSL path to Windows path for PowerShell
    const { stdout: winPath } = await spawnAsync('wslpath', ['-w', wslPath]);
    const windowsPath = winPath.trim();

    // PowerShell script to save clipboard image
    const script = `
      Add-Type -AssemblyName System.Windows.Forms;
      Add-Type -AssemblyName System.Drawing;

      $image = [System.Windows.Forms.Clipboard]::GetImage();
      if ($image -ne $null) {
        $image.Save('${windowsPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png);
        Write-Output 'success';
      } else {
        Write-Output 'no-image';
      }
    `;

    const { stdout } = await spawnAsync(powershell, [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ]);

    if (stdout.trim() !== 'success') {
      return null;
    }

    // Verify file exists and has content
    const stats = await fs.stat(wslPath);
    if (stats.size > 0) {
      debugLogger.debug(
        `Saved WSL clipboard image to ${wslPath} (${stats.size} bytes)`,
      );
      return wslPath;
    }

    // File is empty, clean up
    await fs.unlink(wslPath);
    return null;
  } catch (error) {
    debugLogger.warn('Error saving WSL clipboard image:', error);
    return null;
  }
}

/**
 * Checks if the system clipboard contains an image (cross-platform + WSL)
 * @returns true if clipboard contains an image
 */
export async function clipboardHasImage(): Promise<boolean> {
  // Check if running in WSL
  if (isWSL()) {
    return await wslClipboardHasImage();
  }

  // Use cross-platform clipboard library
  try {
    return await Clipboard.hasImage();
  } catch (error) {
    debugLogger.warn('Error checking clipboard for image:', error);
    return false;
  }
}

/**
 * Detects image format from base64 data by checking magic bytes
 * @param base64Data The base64 encoded image data
 * @returns The detected file extension (png, jpg, gif, bmp, webp) or 'png' as default
 */
function detectImageFormat(base64Data: string): string {
  try {
    // Decode first few bytes to check magic numbers
    const buffer = Buffer.from(base64Data.slice(0, 16), 'base64');

    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e) {
      return 'png';
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'jpg';
    }

    // GIF: 47 49 46
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return 'gif';
    }

    // BMP: 42 4D
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
      return 'bmp';
    }

    // WebP: 52 49 46 46 ... 57 45 42 50
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return 'webp';
    }

    // TIFF (little-endian): 49 49 2A 00
    if (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a) {
      return 'tiff';
    }

    // TIFF (big-endian): 4D 4D 00 2A
    if (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00) {
      return 'tiff';
    }

    // Default to PNG if format is unknown
    return 'png';
  } catch {
    return 'png';
  }
}

/**
 * Saves the image from clipboard to a temporary file (cross-platform + WSL)
 * @param targetDir The target directory to create temp files within
 * @returns The path to the saved image file, or null if no image or error
 */
export async function saveClipboardImage(
  targetDir?: string,
): Promise<string | null> {
  // Check if running in WSL
  if (isWSL()) {
    return await wslSaveClipboardImage(targetDir);
  }

  // Use cross-platform clipboard library
  try {
    // Check if clipboard has an image
    if (!(await clipboardHasImage())) {
      return null;
    }

    // Get the image data as base64
    const base64Data = await Clipboard.getImageBase64();
    if (!base64Data) {
      return null;
    }

    // Create a temporary directory for clipboard images within the target directory
    // This avoids security restrictions on paths outside the target directory
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, '.gemini-clipboard');
    await fs.mkdir(tempDir, { recursive: true });

    // Generate a unique filename with timestamp
    const timestamp = new Date().getTime();

    // Detect image format from magic bytes
    const extension = detectImageFormat(base64Data);
    const tempFilePath = path.join(
      tempDir,
      `clipboard-${timestamp}.${extension}`,
    );

    // Convert base64 to buffer and save to file
    const imageBuffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(tempFilePath, imageBuffer);

    // Verify the file was created and has content
    const stats = await fs.stat(tempFilePath);
    if (stats.size > 0) {
      debugLogger.debug(
        `Saved clipboard image to ${tempFilePath} (${stats.size} bytes, format: ${extension})`,
      );
      return tempFilePath;
    }

    // File is empty, clean up and return null
    await fs.unlink(tempFilePath);
    return null;
  } catch (error) {
    debugLogger.warn('Error saving clipboard image:', error);
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
          file.endsWith('.jpeg') ||
          file.endsWith('.tiff') ||
          file.endsWith('.gif') ||
          file.endsWith('.bmp') ||
          file.endsWith('.webp'))
      ) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < oneHourAgo) {
          await fs.unlink(filePath);
          debugLogger.debug(`Cleaned up old clipboard image: ${filePath}`);
        }
      }
    }
  } catch (error) {
    // Ignore errors in cleanup - directory might not exist yet
    debugLogger.debug('Clipboard cleanup skipped:', error);
  }
}
