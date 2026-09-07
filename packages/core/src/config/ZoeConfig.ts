/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export interface ZoeSettings {
  version: string;
  theme: string;
  model: string;
}

export const DEFAULT_SETTINGS: ZoeSettings = {
  version: '0.1.0',
  theme: 'default',
  model: 'placeholder',
};

export class ZoeConfig {
  private configDir: string;
  private configFile: string;
  private settings: ZoeSettings;

  constructor(customConfigDir?: string) {
    this.configDir = customConfigDir || path.join(os.homedir(), '.zoe');
    this.configFile = path.join(this.configDir, 'config.json');
    this.settings = this.load();
  }

  public getConfigDir(): string {
    return this.configDir;
  }

  public getSettings(): ZoeSettings {
    return { ...this.settings };
  }

  public load(): ZoeSettings {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      // Fallback to default on read/parse error
    }
    return { ...DEFAULT_SETTINGS };
  }

  public save(newSettings: Partial<ZoeSettings>): void {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      this.settings = { ...this.settings, ...newSettings };
      fs.writeFileSync(this.configFile, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (err) {
      // Best-effort save
      console.error('Failed to save Zoe config:', err);
    }
  }
}
