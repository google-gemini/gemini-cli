/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '../utils/debugLogger.js';
import type { IFileSystem } from './system/IFileSystem.js';
import { NodeFileSystem } from './system/NodeFileSystem.js';
import type { IIdGenerator } from './system/IIdGenerator.js';
import { NodeIdGenerator } from './system/NodeIdGenerator.js';

export interface ContextTracerOptions {
  enabled?: boolean;
  targetDir: string;
  sessionId: string;
}

export class ContextTracer {
  private traceDir: string;
  private assetsDir: string;
  private enabled: boolean;
  private fileSystem: IFileSystem;
  private idGenerator: IIdGenerator;

  private readonly MAX_INLINE_SIZE = 1000;

  constructor(
    options: ContextTracerOptions,
    fileSystem: IFileSystem = new NodeFileSystem(),
    idGenerator: IIdGenerator = new NodeIdGenerator()
  ) {
    this.enabled = options.enabled ?? false;
    this.fileSystem = fileSystem;
    this.idGenerator = idGenerator;

    this.traceDir = this.fileSystem.join(options.targetDir, '.gemini', 'context_trace', options.sessionId);
    this.assetsDir = this.fileSystem.join(this.traceDir, 'assets');

    if (this.enabled) {
      try {
        this.fileSystem.mkdirSync(this.assetsDir, { recursive: true });
        this.logEvent('SYSTEM', 'Context Tracer Initialized', { sessionId: options.sessionId });
      } catch (e) {
        debugLogger.error('Failed to initialize ContextTracer', e);
        this.enabled = false;
      }
    }
  }

  logEvent(
    component: string,
    action: string,
    details?: Record<string, unknown>,
  ) {
    if (!this.enabled) return;
    try {
      let processedDetails: Record<string, unknown> | undefined;

      if (details) {
        processedDetails = {};
        for (const [key, value] of Object.entries(details)) {
          const strValue = typeof value === 'string' ? value : JSON.stringify(value);
          if (strValue && strValue.length > this.MAX_INLINE_SIZE) {
             const assetId = this.saveAsset(component, key, value);
             processedDetails[key] = { $asset: assetId };
          } else {
             processedDetails[key] = value;
          }
        }
      }

      const timestamp = new Date().toISOString();
      const detailsStr = processedDetails
        ? ` | Details: ${JSON.stringify(processedDetails)}`
        : '';
      const logLine = `[${timestamp}] [${component}] ${action}${detailsStr}\n`;
      this.fileSystem.appendFileSync(
        this.fileSystem.join(this.traceDir, 'trace.log'),
        logLine,
        'utf-8',
      );
    } catch (e) {
      debugLogger.warn(`Tracing failed: ${e}`);
    }
  }

  private saveAsset(component: string, assetName: string, data: unknown): string {
    if (!this.enabled) return 'asset-recording-disabled';
    try {
      const assetId = `${Date.now()}-${this.idGenerator.generateId()}-${assetName}.json`;
      const assetPath = this.fileSystem.join(this.assetsDir, assetId);

      this.fileSystem.writeFileSync(assetPath, JSON.stringify(data, null, 2), 'utf-8');
      this.logEvent(component, `Saved asset: ${assetName}`, { assetId });
      return assetId;
    } catch (e) {
      this.logEvent(component, `Failed to save asset: ${assetName}`, {
        error: String(e),
      });
      return 'asset-save-failed';
    }
  }
}
