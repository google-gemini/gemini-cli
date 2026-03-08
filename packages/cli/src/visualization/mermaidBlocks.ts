/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const LINE_NUMBER_PREFIX_RE = /^\s*\d+\s+/;
const MERMAID_FENCE_RE = /```mermaid\s*\r?\n([\s\S]*?)```/gi;

export function normalizeMermaidSpecForRendering(rawSpec: string): string {
  const normalizedNewlines = rawSpec.replace(/\r\n/g, '\n');
  const lines = normalizedNewlines.split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

  if (nonEmptyLines.length === 0) {
    return '';
  }

  // LLMs sometimes emit numbered code-block lines ("1 graph TD", "2 A-->B", ...).
  const numberedLines = nonEmptyLines.filter((line) =>
    LINE_NUMBER_PREFIX_RE.test(line),
  ).length;
  const shouldStripLineNumbers =
    numberedLines >= Math.ceil(nonEmptyLines.length * 0.6);

  const cleaned = lines
    .map((line) =>
      shouldStripLineNumbers ? line.replace(LINE_NUMBER_PREFIX_RE, '') : line,
    )
    .join('\n')
    .trim();

  return cleaned;
}

export function collectNewMermaidSpecs(
  text: string,
  seenSpecs: Set<string>,
): string[] {
  const specs: string[] = [];
  const regex = new RegExp(MERMAID_FENCE_RE.source, MERMAID_FENCE_RE.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const rawSpec = match[1] ?? '';
    const spec = normalizeMermaidSpecForRendering(rawSpec);
    if (!spec || seenSpecs.has(spec)) {
      continue;
    }
    seenSpecs.add(spec);
    specs.push(spec);
  }

  return specs;
}

interface ErrorLike {
  message?: unknown;
  stack?: unknown;
}

export function formatUnknownRenderError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message ?? error.toString();
  }

  if (typeof error === 'object' && error !== null) {
    const errorLike = error as ErrorLike;
    const message =
      typeof errorLike.message === 'string' ? errorLike.message : '';
    const stack = typeof errorLike.stack === 'string' ? errorLike.stack : '';

    const details: string[] = [];
    if (message.length > 0) details.push(message);
    if (stack.length > 0) details.push(stack);

    try {
      const json = JSON.stringify(error, Object.getOwnPropertyNames(Object(error)));
      if (json && json !== '{}') {
        details.push(json);
      }
    } catch {
      // Ignore serialization failures.
    }

    if (details.length > 0) {
      return details.join('\n');
    }
  }

  return String(error);
}

