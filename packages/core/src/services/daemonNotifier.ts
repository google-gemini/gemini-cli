/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Desktop notification system for the daemon. Supports macOS,
 * Linux, and Windows natively using system notification tools.
 */

import * as os from 'node:os';
import { debugLogger } from '../utils/debugLogger.js';

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  sound?: boolean;
}

/**
 * Desktop notification sender that works across macOS, Linux, and Windows.
 */
export class DaemonNotifier {
  private platform: string;
  private available: boolean | null = null;

  constructor() {
    this.platform = os.platform();
  }

  /**
   * Checks if notifications are available on this system.
   */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) {
      return this.available;
    }

    try {
      switch (this.platform) {
        case 'darwin':
          // Check if terminal-notifier is available or osascript works
          this.available = await this.checkMacOS();
          break;
        case 'linux':
          // Check if notify-send is available
          this.available = await this.checkLinux();
          break;
        case 'win32':
          // Windows PowerShell can send notifications
          this.available = await this.checkWindows();
          break;
        default:
          this.available = false;
      }
    } catch {
      this.available = false;
    }

    return this.available;
  }

  /**
   * Sends a desktop notification.
   */
  async notify(options: NotificationOptions): Promise<boolean> {
    if (!(await this.isAvailable())) {
      debugLogger.warn('[Notifier] Notifications not available on this system');
      return false;
    }

    try {
      switch (this.platform) {
        case 'darwin':
          return await this.notifyMacOS(options);
        case 'linux':
          return await this.notifyLinux(options);
        case 'win32':
          return await this.notifyWindows(options);
        default:
          return false;
      }
    } catch (error) {
      debugLogger.error('[Notifier] Failed to send notification:', error);
      return false;
    }
  }

  // --- Platform-specific implementations ---

  private async checkMacOS(): Promise<boolean> {
    if (this.platform !== 'darwin') return false;

    // Try osascript first (always available on macOS)
    try {
      const { exec } = await import('node:child_process');
      return await new Promise((resolve) => {
        exec('osascript -e "display notification "" with title """', (error) => {
          resolve(!error);
        });
      });
    } catch {
      return false;
    }
  }

  private async checkLinux(): Promise<boolean> {
    if (this.platform !== 'linux') return false;

    try {
      const { exec } = await import('node:child_process');
      return await new Promise((resolve) => {
        exec('which notify-send', (error) => {
          resolve(!error);
        });
      });
    } catch {
      return false;
    }
  }

  private async checkWindows(): Promise<boolean> {
    if (this.platform !== 'win32') return false;

    // Windows 10+ has built-in PowerShell notification support
    try {
      const { exec } = await import('node:child_process');
      return await new Promise((resolve) => {
        exec('powershell -Command "Get-Command New-BurntToastNotification -ErrorAction SilentlyContinue"', (error) => {
          // Even if BurntToast isn't available, we can use Windows native
          resolve(true);
        });
      });
    } catch {
      return true; // Windows always has some notification capability
    }
  }

  private async notifyMacOS(options: NotificationOptions): Promise<boolean> {
    const { title, body, sound = true } = options;

    // Escape quotes in the title and body
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedBody = body.replace(/"/g, '\\"');

    // Use osascript for macOS notifications
    const script = sound
      ? `display notification "${escapedBody}" with title "${escapedTitle}" sound name "default"`
      : `display notification "${escapedBody}" with title "${escapedTitle}"`;

    try {
      const { exec } = await import('node:child_process');
      return await new Promise((resolve) => {
        exec(`osascript -e '${script}'`, (error) => {
          if (error) {
            debugLogger.error('[Notifier] macOS notification failed:', error);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    } catch {
      return false;
    }
  }

  private async notifyLinux(options: NotificationOptions): Promise<boolean> {
    const { title, body, icon } = options;

    // Build notify-send command
    const args = [title, body];
    if (icon) {
      args.unshift('--icon', icon);
    }

    try {
      const { exec } = await import('node:child_process');
      return await new Promise((resolve) => {
        exec(`notify-send ${args.map(a => `"${a}"`).join(' ')}`, (error) => {
          if (error) {
            debugLogger.error('[Notifier] Linux notification failed:', error);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    } catch {
      return false;
    }
  }

  private async notifyWindows(options: NotificationOptions): Promise<boolean> {
    const { title, body } = options;

    // Escape for PowerShell
    const escapedTitle = title.replace(/'/g, "''");
    const escapedBody = body.replace(/'/g, "''");

    // Use PowerShell with Windows native toast notification
    const psScript = `
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

      $template = @"
      <toast>
        <visual>
          <binding template="ToastText02">
            <text id="1">${escapedTitle}</text>
            <text id="2">${escapedBody}</text>
          </binding>
        </visual>
      </toast>
"@

      $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
      $xml.LoadXml($template)
      $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
      [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Gemini CLI").Show($toast)
    `;

    try {
      const { exec } = await import('node:child_process');
      return await new Promise((resolve) => {
        exec(`powershell -Command "${psScript.replace(/\n/g, ' ')}"`, (error) => {
          if (error) {
            // Fallback to a simpler method
            this.notifyWindowsFallback(title, body).then(resolve);
          } else {
            resolve(true);
          }
        });
      });
    } catch {
      return this.notifyWindowsFallback(title, body);
    }
  }

  private async notifyWindowsFallback(title: string, body: string): Promise<boolean> {
    // Simple fallback using msg command (Windows)
    const escapedBody = `${title}: ${body}`.replace(/"/g, '');

    try {
      const { exec } = await import('node:child_process');
      return await new Promise((resolve) => {
        exec(`msg * "${escapedBody}"`, (error) => {
          resolve(!error);
        });
      });
    } catch {
      return false;
    }
  }
}