/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { debugLogger } from '@google/gemini-cli-core';

// Dynamically import node-screenshots to handle optional dependency
let screenshots: typeof import('node-screenshots') | null = null;

/**
 * Lazily loads the node-screenshots module
 * @returns The screenshots module or null if not available
 */
async function getScreenshotsModule() {
  if (screenshots) {
    return screenshots;
  }

  try {
    screenshots = await import('node-screenshots');
    return screenshots;
  } catch (error) {
    debugLogger.warn('node-screenshots not available:', error);
    return null;
  }
}

/**
 * Checks if screenshot capture is available on this platform
 * @returns true if screenshot capture is supported
 */
export async function isScreenshotAvailable(): Promise<boolean> {
  const module = await getScreenshotsModule();
  return module !== null;
}

/**
 * Lists all available displays/monitors
 * @returns Array of display information or empty array if not available
 */
export async function listDisplays(): Promise<
  Array<{ id: number; name: string; width: number; height: number }>
> {
  try {
    const module = await getScreenshotsModule();
    if (!module) {
      return [];
    }

    const monitors = module.Monitor.all();
    return monitors.map((monitor) => ({
      id: monitor.id,
      name: monitor.name || `Display ${monitor.id}`,
      width: monitor.width,
      height: monitor.height,
    }));
  } catch (error) {
    debugLogger.warn('Error listing displays:', error);
    return [];
  }
}

/**
 * Captures a screenshot from the primary display
 * @param targetDir The target directory to save the screenshot
 * @returns The path to the saved screenshot file, or null on error
 */
export async function captureScreenshot(
  targetDir?: string,
): Promise<string | null> {
  try {
    const module = await getScreenshotsModule();
    if (!module) {
      debugLogger.warn('Screenshot capture not available');
      return null;
    }

    // Get all monitors
    const monitors = module.Monitor.all();
    if (monitors.length === 0) {
      debugLogger.warn('No monitors available for capture');
      return null;
    }

    // Find the primary monitor or use the first one
    const primaryMonitor = monitors.find((m) => m.isPrimary) || monitors[0];

    // Capture the screenshot
    const image = primaryMonitor.captureImageSync();
    if (!image) {
      debugLogger.warn('Failed to capture screenshot');
      return null;
    }

    // Convert to PNG
    const pngBuffer = image.toPngSync();

    // Create screenshot directory
    const baseDir = targetDir || process.cwd();
    const screenshotDir = path.join(baseDir, '.gemini-screenshots');
    await fs.mkdir(screenshotDir, { recursive: true });

    // Generate unique filename with timestamp
    const timestamp = new Date().getTime();
    const screenshotPath = path.join(
      screenshotDir,
      `screenshot-${timestamp}.png`,
    );

    // Save the screenshot
    await fs.writeFile(screenshotPath, pngBuffer);

    // Verify the file was created
    const stats = await fs.stat(screenshotPath);
    if (stats.size > 0) {
      debugLogger.debug(
        `Captured screenshot to ${screenshotPath} (${stats.size} bytes)`,
      );
      return screenshotPath;
    }

    // File is empty, clean up
    await fs.unlink(screenshotPath);
    return null;
  } catch (error) {
    debugLogger.warn('Error capturing screenshot:', error);
    return null;
  }
}

/**
 * Captures a screenshot from a specific display
 * @param displayId The ID of the display to capture from
 * @param targetDir The target directory to save the screenshot
 * @returns The path to the saved screenshot file, or null on error
 */
export async function captureScreenshotFromDisplay(
  displayId: number,
  targetDir?: string,
): Promise<string | null> {
  try {
    const module = await getScreenshotsModule();
    if (!module) {
      debugLogger.warn('Screenshot capture not available');
      return null;
    }

    const monitors = module.Monitor.all();
    const monitor = monitors.find((m) => m.id === displayId);

    if (!monitor) {
      debugLogger.warn(`Monitor with ID ${displayId} not found`);
      return null;
    }

    const image = monitor.captureImageSync();
    if (!image) {
      debugLogger.warn('Failed to capture screenshot');
      return null;
    }

    // Convert to PNG
    const pngBuffer = image.toPngSync();

    // Create screenshot directory
    const baseDir = targetDir || process.cwd();
    const screenshotDir = path.join(baseDir, '.gemini-screenshots');
    await fs.mkdir(screenshotDir, { recursive: true });

    // Generate unique filename with timestamp
    const timestamp = new Date().getTime();
    const screenshotPath = path.join(
      screenshotDir,
      `screenshot-${timestamp}.png`,
    );

    // Save the screenshot
    await fs.writeFile(screenshotPath, pngBuffer);

    // Verify the file was created
    const stats = await fs.stat(screenshotPath);
    if (stats.size > 0) {
      debugLogger.debug(
        `Captured screenshot to ${screenshotPath} (${stats.size} bytes)`,
      );
      return screenshotPath;
    }

    // File is empty, clean up
    await fs.unlink(screenshotPath);
    return null;
  } catch (error) {
    debugLogger.warn('Error capturing screenshot:', error);
    return null;
  }
}

/**
 * Cleans up old screenshot files
 * Removes files older than 1 hour
 * @param targetDir The target directory where screenshots are stored
 */
export async function cleanupOldScreenshots(targetDir?: string): Promise<void> {
  try {
    const baseDir = targetDir || process.cwd();
    const screenshotDir = path.join(baseDir, '.gemini-screenshots');
    const files = await fs.readdir(screenshotDir);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const file of files) {
      if (file.startsWith('screenshot-') && file.endsWith('.png')) {
        const filePath = path.join(screenshotDir, file);
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < oneHourAgo) {
          await fs.unlink(filePath);
          debugLogger.debug(`Cleaned up old screenshot: ${filePath}`);
        }
      }
    }
  } catch (error) {
    // Ignore errors in cleanup - directory might not exist yet
    debugLogger.debug('Screenshot cleanup skipped:', error);
  }
}
