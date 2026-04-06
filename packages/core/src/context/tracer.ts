/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

export class ContextTracer {
  private traceDir: string;
  private assetsDir: string;
  private enabled: boolean;

  constructor(targetDir: string, sessionId: string) {
    this.enabled = process.env['GEMINI_CONTEXT_TRACE'] === 'true';
    this.traceDir = path.join(targetDir, '.gemini', 'context_trace', sessionId);
    this.assetsDir = path.join(this.traceDir, 'assets');

    if (this.enabled) {
      try {
        fs.mkdirSync(this.assetsDir, { recursive: true });
        this.logEvent('SYSTEM', 'Context Tracer Initialized', { sessionId });
      } catch (e) {
        console.error('Failed to initialize ContextTracer', e);
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
      const timestamp = new Date().toISOString();
      const detailsStr = details
        ? ` | Details: ${JSON.stringify(details)}`
        : '';
      const logLine = `[${timestamp}] [${component}] ${action}${detailsStr}\n`;
      fs.appendFileSync(
        path.join(this.traceDir, 'trace.log'),
        logLine,
        'utf-8',
      );
    } catch (e) {
      // fail silently in trace
    }
  }

  saveAsset(component: string, assetName: string, data: unknown): string {
    if (!this.enabled) return 'asset-recording-disabled';
    try {
      const assetId = `${Date.now()}-${randomUUID().slice(0, 6)}-${assetName}.json`;
      const assetPath = path.join(this.assetsDir, assetId);

      fs.writeFileSync(assetPath, JSON.stringify(data, null, 2), 'utf-8');
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
