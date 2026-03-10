/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as child_process from 'node:child_process';
import * as os from 'node:os';

export enum AudioEvent {
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  PROCESSING_START = 'PROCESSING_START',
}

export class AudioNotificationService {
  private isEnabled: boolean;

  constructor(isEnabled: boolean) {
    this.isEnabled = isEnabled;
  }

  async play(event: AudioEvent): Promise<void> {
    if (!this.isEnabled) return;

    try {
      const command = this.getCommandForEvent(event);
      if (command) {
        // We execute this synchronously and ignore the callback so it plays asynchronously
        // in the background without blocking the main thread.
        child_process.exec(command, () => {
          // Ignore audio errors silently to avoid cluttering the terminal
        });
      }
    } catch (_error) {
      // Ignore errors finding/playing audio
    }
  }

  private getCommandForEvent(event: AudioEvent): string | null {
    const platform = os.platform();
    let freq = 0;
    let duration = 0;

    switch (event) {
      case AudioEvent.SUCCESS:
        freq = 800; // pleasant high beep
        duration = 200;
        break;
      case AudioEvent.ERROR:
        freq = 300; // low error buzz
        duration = 400;
        break;
      case AudioEvent.PROCESSING_START:
        freq = 600; // mid processing beep
        duration = 100;
        break;
      default:
        return null;
    }

    if (platform === 'darwin') {
      // Use macOS native 'afplay' with a built-in system sound, or 'say' as fallback.
      // But actually, we want simple beeps or tones. 'afplay' requires a file.
      // Let's use terminal bell config or default afplay sounds.
      switch (event) {
        case AudioEvent.SUCCESS:
          return 'afplay /System/Library/Sounds/Glass.aiff';
        case AudioEvent.ERROR:
          return 'afplay /System/Library/Sounds/Basso.aiff';
        case AudioEvent.PROCESSING_START:
          return 'afplay /System/Library/Sounds/Tink.aiff';
        default:
          return null;
      }
    } else if (platform === 'win32') {
      // Use PowerShell to generate a beep
      return `powershell -c "[console]::beep(${freq},${duration})"`;
    } else if (platform === 'linux') {
      // Use aplay/paplay or generic speaker-test if available, or printf '\\a'
      // Try using printf for a terminal bell, which is the safest fallback on Linux.
      return 'printf "\\a"';
    }

    return null;
  }
}
