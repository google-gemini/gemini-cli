/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GceCosProvider } from './GceCosProvider.ts';
import { WorkspaceProvider } from './BaseProvider.ts';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../..');

export class ProviderFactory {
  static getProvider(config: { projectId: string; zone: string; instanceName: string }): WorkspaceProvider {
    // Currently we only have GceCosProvider, but this is where we'd branch
    return new GceCosProvider(config.projectId, config.zone, config.instanceName, REPO_ROOT);
  }
}
