/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const LINE_NUMBER_PREFIX_RE = /^\s*\d+\s+/;
const MERMAID_FENCE_RE = /```mermaid\s*\r?\n([\s\S]*?)```/gi;
const INDENTED_LINE_RE = /^\s{2,}\S/;
const MERMAID_START_RE =
  /^(?:%%\{.*\}%%\s*)?(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|gitGraph|requirementDiagram|C4(?:Context|Container|Component|Dynamic|Deployment))\b/i;

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

  // Fallback: model may emit Mermaid as an indented/numbered block without
  // ```mermaid fences (common in long explanatory responses).
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? '';
    const trimmedRaw = rawLine.trim();
    if (trimmedRaw.length === 0) {
      continue;
    }

    const lineIsCodeStyled =
      LINE_NUMBER_PREFIX_RE.test(rawLine) || INDENTED_LINE_RE.test(rawLine);
    if (!lineIsCodeStyled) {
      continue;
    }

    const normalizedLine = rawLine.replace(LINE_NUMBER_PREFIX_RE, '').trim();
    if (!MERMAID_START_RE.test(normalizedLine)) {
      continue;
    }

    const blockLines: string[] = [];
    let j = i;
    while (j < lines.length) {
      const candidate = lines[j] ?? '';
      const candidateTrimmed = candidate.trim();
      if (candidateTrimmed.length === 0) {
        blockLines.push(candidate);
        j += 1;
        continue;
      }

      const candidateIsCodeStyled =
        LINE_NUMBER_PREFIX_RE.test(candidate) ||
        INDENTED_LINE_RE.test(candidate);
      if (!candidateIsCodeStyled) {
        break;
      }
      blockLines.push(candidate);
      j += 1;
    }

    const spec = normalizeMermaidSpecForRendering(blockLines.join('\n'));
    if (spec && !seenSpecs.has(spec)) {
      seenSpecs.add(spec);
      specs.push(spec);
    }

    i = j - 1;
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
      const json = JSON.stringify(
        error,
        Object.getOwnPropertyNames(Object(error)),
      );
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
