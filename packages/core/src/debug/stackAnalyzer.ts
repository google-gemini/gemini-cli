/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StackFrame, Variable } from './types.js';

export interface StackAnalysis {
  summary: string;
  relevantFrames: StackFrame[];
  rootCauseFrame?: StackFrame;
  suggestions: string[];
}

export function analyzeStackTrace(frames: StackFrame[]): StackAnalysis {
  const suggestions: string[] = [];

  // Filter out internal/node_modules frames
  const relevantFrames = frames.filter((f) => {
    const path = f.source?.path ?? '';
    return !path.includes('node_modules') && !path.includes('internal/');
  });

  const rootCauseFrame = relevantFrames[0];

  const depth = frames.length;
  const userFrames = relevantFrames.length;
  const summary = `Stack depth: ${depth} frames (${userFrames} user code, ${depth - userFrames} internal)`;

  if (rootCauseFrame) {
    const location = rootCauseFrame.source?.path
      ? `${rootCauseFrame.source.path}:${rootCauseFrame.line}`
      : rootCauseFrame.name;
    suggestions.push(`Root cause likely at: ${location}`);
  }

  if (depth > 50) {
    suggestions.push('Deep stack — possible recursion or callback chain.');
  }

  for (const frame of relevantFrames) {
    if (frame.name.includes('async') || frame.name.includes('await')) {
      suggestions.push(
        'Async code detected — check for unhandled promise rejections.',
      );
      break;
    }
  }

  return { summary, relevantFrames, rootCauseFrame, suggestions };
}

export function formatVariablesForDisplay(variables: Variable[]): string {
  return variables
    .map((v) => {
      const type = v.type ? ` (${v.type})` : '';
      return `  ${v.name}${type} = ${v.value}`;
    })
    .join('\n');
}

export function formatStackForDisplay(frames: StackFrame[]): string {
  return frames
    .map((f, i) => {
      const location = f.source?.path
        ? `${f.source.path}:${f.line}:${f.column}`
        : '<unknown>';
      return `  #${i} ${f.name} at ${location}`;
    })
    .join('\n');
}
