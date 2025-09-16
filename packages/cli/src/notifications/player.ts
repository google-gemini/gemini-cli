/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Plays a sound using platform-specific commands.
 * @param soundPath The path to the sound file or a system sound alias.
 */
export function playSound(soundPath: string): void {
  const isWindows = os.platform() === 'win32';
  const isSystemSound =
    isWindows &&
    ['SystemAsterisk', 'SystemExclamation'].includes(soundPath);

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
        args.push(
          '-c',
          `(New-Object Media.SystemSounds).${soundPath}.Play();`,
        );
      } else {
        args.push(
          '-c',
          `(New-Object Media.SoundPlayer '${soundPath}').PlaySync();`,
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
      if (os.platform() === 'linux' && (err as any).code === 'ENOENT') {
        // Try aplay if paplay is not found
        const fallback = spawn('aplay', args, { detached: true, stdio: 'ignore' });
        fallback.on('error', (fallbackErr) => {
          console.error(`Failed to play sound with paplay and aplay: ${fallbackErr.message}`);
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
