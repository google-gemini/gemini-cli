/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Platform-specific clipboard test helpers
 */
export class ClipboardTestHelpers {
  /**
   * Copies text to the system clipboard
   */
  static async copyText(text: string): Promise<void> {
    const platform = os.platform();

    try {
      if (platform === 'win32') {
        // Windows
        await execAsync(`echo ${JSON.stringify(text)} | clip`);
      } else if (platform === 'darwin') {
        // macOS
        const proc = exec('pbcopy');
        proc.stdin?.write(text);
        proc.stdin?.end();
        await new Promise((resolve, reject) => {
          proc.on('close', (code) => {
            if (code === 0) resolve(undefined);
            else reject(new Error(`pbcopy exited with code ${code}`));
          });
          proc.on('error', reject);
          // Add timeout to prevent hanging
          setTimeout(() => reject(new Error('pbcopy timed out')), 5000);
        });
      } else if (platform === 'linux') {
        // Linux
        try {
          const proc = exec('xclip -selection clipboard');
          proc.stdin?.write(text);
          proc.stdin?.end();
          await new Promise((resolve, reject) => {
            proc.on('close', (code) => {
              if (code === 0) resolve(true);
              else reject(new Error(`xclip exited with code ${code}`));
            });
            proc.on('error', reject);
            // Add timeout to prevent hanging
            setTimeout(() => reject(new Error('xclip timed out')), 5000);
          });
        } catch (error) {
          console.error('xclip failed, trying xsel...', error);
          // Fallback to xsel if xclip is not available
          const proc = exec('xsel --clipboard --input');
          proc.stdin?.write(text);
          proc.stdin?.end();
          await new Promise((resolve, reject) => {
            proc.on('close', (code) => {
              if (code === 0) resolve(undefined);
              else reject(new Error(`xsel exited with code ${code}`));
            });
            proc.on('error', reject);
            // Add timeout to prevent hanging
            setTimeout(() => reject(new Error('xsel timed out')), 5000);
          });
        }
      }
    } catch (error) {
      console.error('Failed to copy text to clipboard:', error);
      throw error;
    }
  }

  /**
   * Copies an image to the system clipboard from a file
   */
  static async copyImageFromFile(filePath: string): Promise<void> {
    const platform = os.platform();
    const absolutePath = path.resolve(filePath);

    try {
      if (platform === 'win32') {
        // Windows - requires .NET framework
        // Escape backslashes for PowerShell
        const script = `
          Add-Type -AssemblyName System.Windows.Forms;
          $image = [System.Drawing.Image]::FromFile('${absolutePath.replace(/\\/g, '\\')}');
          [System.Windows.Forms.Clipboard]::SetImage($image);
        `;
        await execAsync(`powershell -Command "${script}"`);
      } else if (platform === 'darwin') {
        // macOS - escape single quotes and backslashes for AppleScript
        const escapedPath = absolutePath.replace(/([\\'])/g, '\\$1');
        await execFileAsync('osascript', [
          '-e',
          `set the clipboard to (read (POSIX file "${escapedPath}") as «class PNGf»)`,
        ]);
      } else if (platform === 'linux') {
        // Linux - use execFile to avoid shell injection
        await execFileAsync('xclip', [
          '-selection',
          'clipboard',
          '-t',
          'image/png',
          '-i',
          absolutePath,
        ]);
      }
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error);
      throw error;
    }
  }

  /**
   * Clears the system clipboard
   */
  static async clearClipboard(): Promise<void> {
    const platform = os.platform();

    try {
      if (platform === 'win32') {
        await execAsync('echo off | clip');
      } else if (platform === 'darwin') {
        await execAsync('pbcopy < /dev/null');
      } else if (platform === 'linux') {
        try {
          await execAsync('xclip -selection clipboard /dev/null');
        } catch {
          await execAsync('xsel --clipboard --clear');
        }
      }
    } catch (error) {
      console.error('Failed to clear clipboard:', error);
      throw error;
    }
  }

  /**
   * Creates a temporary image file for testing
   */
  static async createTestImage(_width = 100, _height = 100): Promise<string> {
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `test-image-${Date.now()}.png`);

    // Create a simple PNG image using a base64-encoded 1x1 transparent pixel
    const base64Image =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    await fs.writeFile(tempPath, Buffer.from(base64Image, 'base64'));

    return tempPath;
  }

  /**
   * Cleans up temporary files
   */
  static async cleanupTempFiles(pattern: string): Promise<void> {
    const tempDir = os.tmpdir();
    const files = await fs.readdir(tempDir);

    for (const file of files) {
      if (file.includes(pattern)) {
        try {
          await fs.unlink(path.join(tempDir, file));
        } catch (error) {
          console.warn(`Failed to delete temp file ${file}:`, error);
        }
      }
    }
  }

  /**
   * Gets text from the system clipboard
   */
  static async getClipboardText(): Promise<string> {
    const platform = os.platform();

    try {
      if (platform === 'win32') {
        // Windows - Use -Command flag to ensure non-interactive execution
        const { stdout } = await execAsync(
          'powershell -Command "Get-Clipboard"',
        );
        return stdout.trim();
      } else if (platform === 'darwin') {
        // macOS
        const { stdout } = await execAsync('pbpaste');
        return stdout;
      } else if (platform === 'linux') {
        // Linux
        try {
          const { stdout } = await execAsync('xclip -selection clipboard -o');
          return stdout;
        } catch {
          // Fallback to xsel
          const { stdout } = await execAsync('xsel --clipboard --output');
          return stdout;
        }
      }
      throw new Error(`Unsupported platform: ${platform}`);
    } catch (error) {
      console.error('Failed to get text from clipboard:', error);
      throw error;
    }
  }

  /**
   * Gets the current platform
   */
  static getPlatform(): NodeJS.Platform {
    return os.platform();
  }

  /**
   * Tests if clipboard operations are working
   */
  static async isClipboardAvailable(): Promise<boolean> {
    try {
      const testString = 'clipboard_availability_test_' + Date.now();
      await this.copyText(testString);
      const retrieved = await this.getClipboardText();
      return retrieved.trim() === testString;
    } catch {
      return false;
    }
  }

  /**
   * Skips test if the platform is not supported
   */
  static skipIfUnsupported(
    platforms: NodeJS.Platform[] = ['darwin', 'win32', 'linux'],
  ): void {
    const currentPlatform = os.platform();
    if (!platforms.includes(currentPlatform)) {
      console.warn(
        `Skipping test on ${currentPlatform} as it's not in the supported platforms: ${platforms.join(', ')}`,
      );
      return;
    }
  }
}

// Using named export instead of default export
