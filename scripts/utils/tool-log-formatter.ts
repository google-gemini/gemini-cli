/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ToolLogEntry {
  toolRequest: {
    name: string;
    args: string;
    success: boolean;
    duration_ms: number;
    prompt_id?: string;
    error?: string;
    error_type?: string;
  };
}

const MAX_ARG_VALUE_LENGTH = 60;

function formatArgs(argsJson: string): string {
  if (!argsJson || argsJson === '{}') {
    return '';
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(argsJson) as Record<string, unknown>;
  } catch {
    return truncate(argsJson, MAX_ARG_VALUE_LENGTH);
  }

  const pairs: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
    pairs.push(
      `${key}=${JSON.stringify(truncate(String(strValue), MAX_ARG_VALUE_LENGTH))}`,
    );
  }

  return pairs.join(', ');
}

function truncate(str: string, max: number): string {
  if (str.length <= max) {
    return str;
  }
  return str.slice(0, max - 1) + '…';
}

export function formatToolLogChain(logs: ToolLogEntry[]): string {
  if (!logs || logs.length === 0) {
    return '';
  }

  const lines: string[] = [];
  const padWidth = String(logs.length).length;

  for (let i = 0; i < logs.length; i++) {
    const { toolRequest: t } = logs[i];
    const idx = String(i + 1).padStart(padWidth, ' ');
    const argsStr = formatArgs(t.args);
    const call = argsStr ? `${t.name}(${argsStr})` : `${t.name}()`;

    const status = t.success ? '✓' : '✗';
    const duration = `${t.duration_ms}ms`;

    lines.push(`  ${idx}. ${call} ── ${status} ${duration}`);

    if (!t.success && (t.error || t.error_type)) {
      const errorType = t.error_type ? `[${t.error_type}] ` : '';
      const errorMsg = t.error ? truncate(t.error, 120) : 'Unknown error';
      lines.push(
        `  ${' '.repeat(padWidth)}   ↳ Error: ${errorType}${errorMsg}`,
      );
    }
  }

  return lines.join('\n');
}
