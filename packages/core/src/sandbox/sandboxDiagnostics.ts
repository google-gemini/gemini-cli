/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SandboxDiagnostic, SandboxDriverType } from './types.js';

/**
 * Entry associating a diagnostic with the driver that produced it.
 */
export interface DiagnosticEntry {
  /** Type of the driver that reported this diagnostic. */
  driverType: SandboxDriverType;
  /** The diagnostic itself. */
  diagnostic: SandboxDiagnostic;
  /** ISO-8601 timestamp when the diagnostic was recorded. */
  timestamp: string;
}

/**
 * Collects and queries sandbox diagnostics produced during driver
 * initialization, selection, and runtime. Use this to present a
 * consolidated view of issues and suggestions to the user.
 */
export class SandboxDiagnosticsCollector {
  private entries: DiagnosticEntry[] = [];

  /**
   * Records diagnostics produced by a specific driver.
   *
   * @param driverType - The type of the driver that produced the diagnostics.
   * @param diagnostics - The diagnostics to record.
   */
  addDiagnostics(
    driverType: SandboxDriverType,
    diagnostics: SandboxDiagnostic[],
  ): void {
    const timestamp = new Date().toISOString();
    for (const diagnostic of diagnostics) {
      this.entries.push({ driverType, diagnostic, timestamp });
    }
  }

  /**
   * Returns all recorded diagnostic entries.
   */
  getAll(): readonly DiagnosticEntry[] {
    return this.entries;
  }

  /**
   * Returns diagnostic entries filtered by level.
   */
  getByLevel(
    level: SandboxDiagnostic['level'],
  ): readonly DiagnosticEntry[] {
    return this.entries.filter((e) => e.diagnostic.level === level);
  }

  /**
   * Returns diagnostic entries produced by a specific driver type.
   */
  getByDriver(driverType: SandboxDriverType): readonly DiagnosticEntry[] {
    return this.entries.filter((e) => e.driverType === driverType);
  }

  /**
   * Returns true if any recorded diagnostic has 'error' level.
   */
  hasErrors(): boolean {
    return this.entries.some((e) => e.diagnostic.level === 'error');
  }

  /**
   * Returns true if any recorded diagnostic has 'warning' level.
   */
  hasWarnings(): boolean {
    return this.entries.some((e) => e.diagnostic.level === 'warning');
  }

  /**
   * Returns a human-readable summary of all diagnostics suitable for
   * display in the CLI.
   */
  formatSummary(): string {
    if (this.entries.length === 0) {
      return 'No sandbox diagnostics recorded.';
    }

    const lines: string[] = [];
    for (const entry of this.entries) {
      const prefix = entry.diagnostic.level.toUpperCase();
      const code = entry.diagnostic.code;
      lines.push(`[${prefix}] (${code}) ${entry.diagnostic.message}`);
      if (entry.diagnostic.suggestion) {
        lines.push(`  -> ${entry.diagnostic.suggestion}`);
      }
    }
    return lines.join('\n');
  }

  /**
   * Removes all recorded diagnostics.
   */
  clear(): void {
    this.entries = [];
  }
}
