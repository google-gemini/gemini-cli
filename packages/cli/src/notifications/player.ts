/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import * as os from 'os';

/**
 * Plays a sound using platform-specific commands.
 * @param soundPath The path to the sound file, or a command string to execute.
 * @param isCommand If true, soundPath is treated as a direct command to execute.
 */
export function playSound(soundPath: string, isCommand: boolean = false): void {
  let command: string;
  const args: string[] = [];

  if (isCommand) {
    // Execute shell commands. WARNING: This can be a security risk if commands are from untrusted sources.
    if (os.platform() === 'win32') {
      command = 'powershell.exe';
      args.push('-c', soundPath);
    } else {
      command = '/bin/sh';
      args.push('-c', soundPath);
    }
  } else {
    switch (os.platform()) {
      case 'darwin': // macOS
        command = 'afplay';
        args.push(soundPath);
        break;
      case 'linux': // Linux
        // Prefer paplay (PulseAudio) if available, otherwise aplay (ALSA)
        command = 'paplay';
        args.push(soundPath);
        // Fallback to aplay if paplay fails or is not found
        // This would typically be handled by trying paplay first and then aplay if it errors.
        // For simplicity, we'll just use paplay for now.
        break;
      case 'win32': // Windows
        command = 'powershell.exe';
        args.push(
          '-c',
          `(New-Object Media.SoundPlayer '${soundPath}').PlaySync();`,
        );
        break;
      default:
        console.warn(`Audio notifications not supported on ${os.platform()}`);
        return;
    }
  }

  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });

    child.on('error', (err) => {
      console.error(`Failed to play sound: ${err.message}`);
    });

    child.unref(); // Allow the parent process to exit independently
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error spawning process: ${error.message}`);
    } else {
      console.error('An unknown error occurred while spawning the process.');
    }
  }
}
