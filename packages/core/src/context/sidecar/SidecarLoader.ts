/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import type { Config } from '../../config/config.js';
import type { SidecarConfig } from './types.js';
import { defaultSidecarProfile } from './profiles.js';
import { debugLogger } from 'src/utils/debugLogger.js';

export class SidecarLoader {
  /**
   * Generates a Sidecar JSON graph from the experimental config file path or defaults.
   */
  static fromConfig(config: Config): SidecarConfig {
    const sidecarPath = config.getExperimentalContextSidecarConfig()
    if (sidecarPath && fs.existsSync(sidecarPath)) {
      try {
        const fileContent = fs.readFileSync(sidecarPath, 'utf8');
        return JSON.parse(fileContent) as SidecarConfig;
      } catch (error) {
        debugLogger.error(
          `Failed to parse Sidecar configuration file at ${sidecarPath}:`,
          error,
        );
        // Fallback to default
      }
    }

    return defaultSidecarProfile;
  }
}
