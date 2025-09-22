/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Plays a sound using platform-specific commands.
 * @param soundPath The path to the sound file or a system sound alias.
 */
export function playSound(soundPath: string): void {
  const isWindows = os.platform() === 'win32';
  const isSystemSound =
    isWindows && ['SystemAsterisk', 'SystemExclamation'].includes(soundPath);

  // Validate file path if it's not a Windows system sound
  if (!isSystemSound) {
    const absolutePath = path.isAbsolute(soundPath)
      ? soundPath
      : path.resolve(soundPath);
    if (!fs.existsSync(absolutePath)) {
      console.error(`Sound file not found: ${absolutePath}`);
      return;
    }
    soundPath = absolutePath;
  }

  let command: string;
  const args: string[] = [];

  switch (os.platform()) {
    case 'darwin': // macOS
      command = 'afplay';
      args.push(soundPath);
      break;
    case 'linux': // Linux
      command = 'paplay';
      args.push(soundPath);
      break;
    case 'win32': // Windows
      command = 'powershell.exe';
      if (isSystemSound) {
        // This is safe as isSystemSound check validates the input.
        args.push('-c', `[System.Media.SystemSounds]::${soundPath}.Play();`);
      } else {
        // Securely pass the file path as an argument to the script block.
        // This prevents command injection.
        args.push(
          '-Command',
          `param($soundFile) (New-Object Media.SoundPlayer $soundFile).PlaySync()`,
          '-', // Indicates the end of command arguments and start of script arguments
          soundPath,
        );
      }
      break;
    default:
      console.warn(`Audio notifications not supported on ${os.platform()}`);
      return;
  }

  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });

    child.on('error', (err) => {
      if (
        os.platform() === 'linux' &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        // Try aplay if paplay is not found
        const fallback = spawn('aplay', args, {
          detached: true,
          stdio: 'ignore',
        });
        fallback.on('error', (fallbackErr) => {
          console.error(
            `Failed to play sound with paplay and aplay: ${fallbackErr.message}`,
          );
        });
        fallback.unref();
      } else {
        console.error(`Failed to play sound: ${err.message}`);
      }
    });
    child.unref();
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error spawning process: ${error.message}`);
    } else {
      console.error('An unknown error occurred while spawning the process.');
    }
  }
}
