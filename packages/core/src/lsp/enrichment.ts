/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import type { Diagnostic, LspSettings } from './types.js';
import { DiagnosticSeverity } from './types.js';
import type { LspManager } from './manager.js';
import type { Config } from '../config/config.js';
import type { FileDiff } from '../tools/tools.js';

const MAX_DIAGNOSTICS = 20;

const SEVERITY_LABELS: Record<number, string> = {
  [DiagnosticSeverity.Error]: 'ERROR',
  [DiagnosticSeverity.Warning]: 'WARN',
  [DiagnosticSeverity.Information]: 'INFO',
  [DiagnosticSeverity.Hint]: 'HINT',
};

const SEVERITY_THRESHOLD: Record<string, number> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info: DiagnosticSeverity.Information,
  hint: DiagnosticSeverity.Hint,
};

/**
 * Collect LSP diagnostics for a file after a write/edit operation and format
 * them for inclusion in tool output.
 *
 * @returns A formatted string to append to llmContent, or empty string if no
 *   diagnostics are available.
 */
/**
 * Result from collecting diagnostics, including whether we timed out.
 */
export interface CollectedDiagnostics {
  /** Formatted XML string for llmContent (empty if no diagnostics). */
  llmOutput: string;
  /** Whether the server timed out before responding. */
  timedOut: boolean;
  /** Whether LSP was applicable for this file type at all. */
  applicable: boolean;
  /** The raw diagnostics returned by the server. */
  diagnostics: Diagnostic[];
}

export async function collectDiagnosticsForOutput(
  lspManager: LspManager,
  filePath: string,
  content: string,
  severitySetting: LspSettings['diagnosticSeverity'],
  signal?: AbortSignal,
): Promise<CollectedDiagnostics> {
  if (!lspManager.hasServerFor(filePath)) {
    return {
      llmOutput: '',
      timedOut: false,
      applicable: false,
      diagnostics: [],
    };
  }

  const result = await lspManager.getDiagnostics(filePath, content, signal);

  if (result.diagnostics.length === 0) {
    return {
      llmOutput: '',
      timedOut: result.timedOut,
      applicable: true,
      diagnostics: [],
    };
  }

  return {
    llmOutput: formatDiagnostics(result.diagnostics, filePath, severitySetting),
    timedOut: false,
    applicable: true,
    diagnostics: result.diagnostics,
  };
}

/**
 * Format a list of diagnostics into the XML-tagged output format.
 */
export function formatDiagnostics(
  diagnostics: Diagnostic[],
  filePath: string,
  severitySetting: LspSettings['diagnosticSeverity'],
): string {
  const threshold =
    SEVERITY_THRESHOLD[severitySetting] ?? DiagnosticSeverity.Error;

  // Filter by severity (lower number = higher severity in LSP).
  const filtered = diagnostics.filter(
    (d) => (d.severity ?? DiagnosticSeverity.Error) <= threshold,
  );

  if (filtered.length === 0) return '';

  // Sort by severity (errors first), then by line number.
  filtered.sort((a, b) => {
    const sevDiff =
      (a.severity ?? DiagnosticSeverity.Error) -
      (b.severity ?? DiagnosticSeverity.Error);
    if (sevDiff !== 0) return sevDiff;
    return a.range.start.line - b.range.start.line;
  });

  const truncated = filtered.length > MAX_DIAGNOSTICS;
  const shown = truncated ? filtered.slice(0, MAX_DIAGNOSTICS) : filtered;

  const fileName = path.basename(filePath);
  const lines = shown.map((d) => {
    const sev =
      SEVERITY_LABELS[d.severity ?? DiagnosticSeverity.Error] ?? 'ERROR';
    // LSP lines are 0-based; display as 1-based.
    const line = d.range.start.line + 1;
    const col = d.range.start.character + 1;
    return `${sev.padEnd(5)} line ${line}:${col}: ${d.message}`;
  });

  let body = `Compiler feedback for ${fileName}:\n\n${lines.join('\n')}`;
  if (truncated) {
    body += `\n\n(${filtered.length - MAX_DIAGNOSTICS} more diagnostics omitted)`;
  }

  return `\n\n<lsp_diagnostics file="${filePath}">\n${body}\n</lsp_diagnostics>`;
}

/**
 * Append LSP diagnostic output to existing llmContent.
 */
export function appendLspDiagnostics(
  llmContent: string,
  lspOutput: string,
): string {
  if (!lspOutput) return llmContent;
  return `${llmContent}${lspOutput}`;
}

/**
 * Enrich a tool result with LSP diagnostics. Shared by write_file and edit.
 *
 * Appends diagnostic XML to llmContent and sets a user-facing summary on
 * the display result. No-ops silently if LSP is disabled, no server is
 * available for the file type, or an error occurs.
 *
 * @returns The (possibly enriched) llmContent string.
 */
export async function enrichToolResultWithLsp(
  config: Config,
  filePath: string,
  fileContent: string,
  llmContent: string,
  displayResult: FileDiff,
  signal?: AbortSignal,
): Promise<string> {
  if (!config.isLspEnabled()) return llmContent;

  try {
    const lspMgr = await config.getLspManager();
    if (!lspMgr) return llmContent;

    const collected = await collectDiagnosticsForOutput(
      lspMgr,
      filePath,
      fileContent,
      config.getLspDiagnosticSeverity(),
      signal,
    );

    if (!collected.applicable) return llmContent;

    const enriched = appendLspDiagnostics(llmContent, collected.llmOutput);
    displayResult.lspDiagnosticSummary = buildDiagnosticSummary(
      collected.diagnostics,
      config.getLspDiagnosticSeverity(),
      collected.timedOut,
    );
    return enriched;
  } catch {
    // LSP enrichment is supplementary — never fail the tool.
    return llmContent;
  }
}

/**
 * Build a short user-facing summary of diagnostics (for display in the tool
 * output footer). Shows ALL diagnostics regardless of severity setting —
 * the severity filter only applies to what the model sees in llmContent.
 *
 * Examples:
 *   "LSP: 2 errors"
 *   "LSP: 1 error, 3 warnings"
 *   "LSP: no issues found"
 *   "LSP: timed out waiting for diagnostics (server may still be starting)"
 */
export function buildDiagnosticSummary(
  diagnostics: Diagnostic[],
  _severitySetting: LspSettings['diagnosticSeverity'],
  timedOut?: boolean,
): string {
  if (timedOut && diagnostics.length === 0) {
    return 'LSP: timed out waiting for diagnostics (server may still be starting)';
  }

  const errors = diagnostics.filter(
    (d) =>
      (d.severity ?? DiagnosticSeverity.Error) === DiagnosticSeverity.Error,
  ).length;
  const warnings = diagnostics.filter(
    (d) => d.severity === DiagnosticSeverity.Warning,
  ).length;
  const infos = diagnostics.filter(
    (d) =>
      d.severity === DiagnosticSeverity.Information ||
      d.severity === DiagnosticSeverity.Hint,
  ).length;

  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors !== 1 ? 's' : ''}`);
  if (warnings > 0)
    parts.push(`${warnings} warning${warnings !== 1 ? 's' : ''}`);
  if (infos > 0) parts.push(`${infos} info`);

  if (parts.length === 0) {
    return 'LSP: no issues found';
  }

  return `LSP: ${parts.join(', ')}`;
}
