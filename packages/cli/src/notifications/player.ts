/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { platform } from 'node:os';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { debugLogger } from '@google/gemini-cli-core';

export type SoundType = 'system' | 'custom';

export interface SoundConfig {
  sound: SoundType;
  customPath?: string;
}

export interface PlaySoundResult {
  fallbackUsed: boolean;
  fallbackReason?: string;
}

/**
 * Platform-specific default system sounds
 */
const DEFAULT_SOUNDS = {
  darwin: {
    inputRequired: '/System/Library/Sounds/Glass.aiff',
    taskComplete: '/System/Library/Sounds/Pop.aiff',
    idleAlert: '/System/Library/Sounds/Glass.aiff',
  },
  linux: {
    inputRequired: 'bell',
    taskComplete: 'bell',
    idleAlert: 'bell',
  },
  win32: {
    inputRequired: 'Asterisk',
    taskComplete: 'Exclamation',
    idleAlert: 'Asterisk',
  },
} as const;

/**
 * Plays a sound file or system sound based on the platform.
 */
export async function playSound(
  config: SoundConfig,
  eventType: 'inputRequired' | 'taskComplete' | 'idleAlert',
): Promise<PlaySoundResult> {
  const osPlatform = platform();
  const soundPath =
    config.sound === 'custom' && config.customPath
      ? config.customPath
      : getDefaultSound(osPlatform, eventType);

  if (!soundPath) {
    debugLogger.debug(
      `[Notifications] No sound configured for ${eventType} on ${osPlatform}`,
    );
    return { fallbackUsed: false };
  }

  try {
    if (config.sound === 'custom' && config.customPath) {
      // Validate custom sound file exists
      if (!fs.existsSync(config.customPath)) {
        debugLogger.warn(
          `[Notifications] Custom sound file not found: ${config.customPath}. Falling back to default sound.`,
        );
        // Fallback to default sound
        const defaultSoundPath = getDefaultSound(osPlatform, eventType);
        if (!defaultSoundPath) {
          debugLogger.debug(
            `[Notifications] No default sound configured for ${eventType} on ${osPlatform}`,
          );
          return { fallbackUsed: false };
        }
        await playSoundForPlatform(osPlatform, defaultSoundPath, false);
        return {
          fallbackUsed: true,
          fallbackReason: `Custom sound file not found: ${config.customPath}`,
        };
      }
    }

    await playSoundForPlatform(
      osPlatform,
      soundPath,
      config.sound === 'custom',
    );
    return { fallbackUsed: false };
  } catch (error) {
    debugLogger.debug(
      `[Notifications] Failed to play sound: ${getErrorMessage(error)}`,
    );
    // Silently fail - notifications should not interrupt the user experience
    return { fallbackUsed: false };
  }
}

function getDefaultSound(
  osPlatform: NodeJS.Platform,
  eventType: 'inputRequired' | 'taskComplete' | 'idleAlert',
): string | null {
  if (
    osPlatform === 'darwin' ||
    osPlatform === 'linux' ||
    osPlatform === 'win32'
  ) {
    const defaults = DEFAULT_SOUNDS[osPlatform];
    return defaults[eventType] || null;
  }
  return null;
}

function playSoundForPlatform(
  osPlatform: NodeJS.Platform,
  soundPath: string,
  isCustom: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let command: string;
    let args: string[];

    switch (osPlatform) {
      case 'darwin':
        // macOS: use afplay
        command = 'afplay';
        args = [soundPath];
        break;

      case 'linux':
        // Linux: try paplay first (PulseAudio), fallback to aplay (ALSA)
        if (isCustom) {
          // For custom files, try paplay first
          command = 'paplay';
          args = [soundPath];
        } else {
          // For system sounds, use the bell character or try system sound theme
          // Try paplay with system sound theme first
          command = 'paplay';
          args = ['--volume=65536', soundPath];
        }
        break;

      case 'win32':
        // Windows: use PowerShell to play system sounds
        if (isCustom) {
          // For custom files on Windows, try using PowerShell with Media.SoundPlayer
          // This requires .wav files
          command = 'powershell';
          args = [
            '-Command',
            `$player = New-Object System.Media.SoundPlayer; $player.SoundLocation = "${soundPath}"; $player.PlaySync()`,
          ];
        } else {
          // System sounds: Asterisk, Beep, Exclamation, Hand, Question
          // soundPath already contains the correct system sound name
          command = 'powershell';
          args = [
            '-Command',
            `[System.Media.SystemSounds]::${soundPath}.Play()`,
          ];
        }
        break;

      default:
        reject(new Error(`Unsupported platform: ${osPlatform}`));
        return;
    }

    const childProcess = spawn(command, args, {
      stdio: 'ignore',
      detached: true,
    });

    // Don't wait for the process to finish - play sound asynchronously
    childProcess.unref();

    // Resolve immediately after spawning
    resolve();

    // Handle errors silently
    childProcess.on('error', (error) => {
      // If the command doesn't exist, try fallback for Linux
      if (osPlatform === 'linux' && command === 'paplay') {
        // Try aplay as fallback
        const aplayProcess = spawn('aplay', [soundPath], {
          stdio: 'ignore',
          detached: true,
        });
        aplayProcess.unref();
        aplayProcess.on('error', () => {
          // Silently fail if both fail
          debugLogger.debug(
            `[Notifications] Failed to play sound: ${getErrorMessage(error)}`,
          );
        });
      }
      // Silently fail - don't reject the promise
    });
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
