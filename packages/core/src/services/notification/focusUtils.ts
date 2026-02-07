/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { debugLogger } from '../../utils/debugLogger.js';

const execAsync = promisify(exec);

/**
 * Returns true if the terminal emulator is the frontmost application.
 * Uses OS-specific commands to detect focus.
 */
export async function isTerminalAppFocused(): Promise<boolean | null> {
  const termProgram = process.env['TERM_PROGRAM'];
  const term = process.env['TERM'];

  if (!termProgram && !term) return null;

  let expectedApps: string[] = [];

  if (termProgram) {
    switch (termProgram) {
      case 'Apple_Terminal':
        expectedApps = ['Terminal'];
        break;
      case 'iTerm.app':
        expectedApps = ['iTerm2'];
        break;
      case 'vscode':
        expectedApps = ['Code', 'Code - Insiders'];
        break;
      case 'WarpTerminal':
        expectedApps = ['Warp'];
        break;
      case 'WezTerm':
        expectedApps = ['wezterm', 'wezterm-gui'];
        break;
      case 'Hyper':
        expectedApps = ['Hyper'];
        break;
      default:
        expectedApps = [termProgram];
        break;
    }
  } else if (term) {
    if (term.includes('kitty')) {
      expectedApps = ['kitty'];
    } else if (term.includes('alacritty')) {
      expectedApps = ['Alacritty'];
    } else {
      return null;
    }
  }

  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      // lsappinfo is faster than osascript
      const { stdout } = await execAsync(
        "lsappinfo info -only Name `lsappinfo front` | cut -d '\"' -f4",
      );
      const activeApp = stdout.trim();
      return expectedApps.includes(activeApp);
    }

    if (platform === 'win32') {
      // Use PowerShell to get the foreground window process name
      const command = `powershell -Command "Get-Process | Where-Object { $_.MainWindowHandle -eq (Add-Type -TypeDefinition '[DllImport(\\"user32.dll\\")] public class User32 { [DllImport(\\"user32.dll\\")] public static extern IntPtr GetForegroundWindow(); }' -Name User32 -PassThru)::GetForegroundWindow() } | Select-Object -ExpandProperty Name"`;
      const { stdout } = await execAsync(command);
      const activeApp = stdout.trim();
      return expectedApps.some(
        (app) => activeApp.toLowerCase() === app.toLowerCase(),
      );
    }

    if (platform === 'linux') {
      // Try xdotool if available
      const { stdout } = await execAsync(
        "xdotool getwindowfocus getwindowname 2>/dev/null || xprop -id $(xdotool getwindowfocus) WM_CLASS 2>/dev/null | cut -d '\"' -f4",
      );
      const activeApp = stdout.trim();
      return expectedApps.some((app) =>
        activeApp.toLowerCase().includes(app.toLowerCase()),
      );
    }
  } catch (error) {
    debugLogger.error(error);
    return null;
  }

  return null;
}
