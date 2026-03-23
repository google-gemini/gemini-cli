/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GceCosProvider } from './GceCosProvider.ts';
import type { WorkerProvider } from './BaseProvider.ts';




const REPO_ROOT = process.cwd();

export class ProviderFactory {
  static getProvider(config: {
    projectId: string;
    zone: string;
    instanceName: string;
  }): WorkerProvider {
    // Currently we only have GceCosProvider, but this is where we'd branch
    return new GceCosProvider(
      config.projectId,
      config.zone,
      config.instanceName,
      REPO_ROOT,
    );
  }
}
