/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AI-powered analysis utilities for DAP debug inspection data.
 *
 * Transforms raw DAP protocol data (stack frames, variables, etc.) into
 * structured, readable formats that the LLM agent can reason effectively about.
 */

import type { StackFrame, Variable, Scope } from './dap-types.js';

// ============================================================================
// Stack Trace Formatting
// ============================================================================

/**
 * Formats a stack trace into a clear, annotated representation for the LLM.
 */
export function formatStackTrace(
  frames: StackFrame[],
  options: { maxFrames?: number; includeModuleId?: boolean } = {},
): string {
  const maxFrames = options.maxFrames ?? 20;
  const displayFrames = frames.slice(0, maxFrames);
  const lines: string[] = ['## Stack Trace', ''];

  for (let i = 0; i < displayFrames.length; i++) {
    const frame = displayFrames[i];
    const location = frame.source?.path
      ? `${frame.source.path}:${frame.line}:${frame.column}`
      : '<unknown>';
    const hint =
      frame.presentationHint === 'subtle' ? ' (framework/library)' : '';
    const prefix = i === 0 ? '→' : ' ';

    lines.push(`${prefix} #${i} ${frame.name} at ${location}${hint}`);

    if (options.includeModuleId && frame.moduleId) {
      lines.push(`       module: ${frame.moduleId}`);
    }
  }

  if (frames.length > maxFrames) {
    lines.push(`  ... ${frames.length - maxFrames} more frames omitted`);
  }

  return lines.join('\n');
}

// ============================================================================
// Variable Formatting
// ============================================================================

/**
 * Flattens a variable tree into a readable format for LLM inspection.
 */
export function formatVariables(
  variables: Variable[],
  options: { depth?: number; indent?: number; maxItems?: number } = {},
): string {
  const depth = options.depth ?? 2;
  const indent = options.indent ?? 0;
  const maxItems = options.maxItems ?? 50;
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  const displayVars = variables.slice(0, maxItems);

  for (const variable of displayVars) {
    const typeInfo = variable.type ? `: ${variable.type}` : '';
    const valuePreview = truncateValue(variable.value, 200);

    lines.push(`${prefix}${variable.name}${typeInfo} = ${valuePreview}`);

    // Indicate if variable has nested children that can be expanded
    if (variable.variablesReference > 0 && depth > 0) {
      lines.push(
        `${prefix}  [expandable: ${variable.namedVariables ?? '?'} properties]`,
      );
    }
  }

  if (variables.length > maxItems) {
    lines.push(
      `${prefix}... ${variables.length - maxItems} more variables omitted`,
    );
  }

  return lines.join('\n');
}

/**
 * Formats scope information with their variables.
 */
export function formatScopes(
  scopes: Array<{ scope: Scope; variables: Variable[] }>,
): string {
  const sections: string[] = ['## Variables by Scope', ''];

  for (const { scope, variables } of scopes) {
    const expensive = scope.expensive ? ' (expensive to evaluate)' : '';
    sections.push(`### ${scope.name}${expensive}`);
    sections.push('');

    if (variables.length === 0) {
      sections.push('  (no variables)');
    } else {
      sections.push(formatVariables(variables, { indent: 1 }));
    }
    sections.push('');
  }

  return sections.join('\n');
}

// ============================================================================
// Root-Cause Analysis Prompt
// ============================================================================

/**
 * Constructs a structured analysis prompt combining stack trace, variable
 * state, and optional source context for LLM root-cause analysis.
 */
export function buildAnalysisPrompt(params: {
  stackTrace: StackFrame[];
  variables?: Array<{ scope: Scope; variables: Variable[] }>;
  stoppedReason?: string;
  errorMessage?: string;
  sourceContext?: string;
}): string {
  const sections: string[] = [];

  // Header
  sections.push('# Debug State Analysis');
  sections.push('');

  // Stop reason
  if (params.stoppedReason) {
    sections.push(`**Stopped reason:** ${params.stoppedReason}`);
  }
  if (params.errorMessage) {
    sections.push(`**Error:** ${params.errorMessage}`);
  }
  sections.push('');

  // Stack trace
  sections.push(formatStackTrace(params.stackTrace));
  sections.push('');

  // Variables
  if (params.variables && params.variables.length > 0) {
    sections.push(formatScopes(params.variables));
    sections.push('');
  }

  // Source context
  if (params.sourceContext) {
    sections.push('## Source Context');
    sections.push('```');
    sections.push(params.sourceContext);
    sections.push('```');
    sections.push('');
  }

  // Analysis request
  sections.push('## Analysis Request');
  sections.push('');
  sections.push('Based on the debug state above, please:');
  sections.push('1. Identify the root cause of the issue');
  sections.push('2. Explain the execution path that led to this state');
  sections.push('3. Suggest a fix using the available editing tools');

  return sections.join('\n');
}

// ============================================================================
// Fix Suggestion Formatting
// ============================================================================

/**
 * Formats a debug session summary for the LLM after disconnecting.
 */
export function formatSessionSummary(params: {
  runtime: string;
  breakpointsHit: number;
  errorsFound: string[];
  stepsPerformed: number;
}): string {
  const lines: string[] = ['## Debug Session Summary', ''];
  lines.push(`- **Runtime:** ${params.runtime}`);
  lines.push(`- **Breakpoints hit:** ${params.breakpointsHit}`);
  lines.push(`- **Steps performed:** ${params.stepsPerformed}`);

  if (params.errorsFound.length > 0) {
    lines.push(`- **Errors found:** ${params.errorsFound.length}`);
    for (const err of params.errorsFound) {
      lines.push(`  - ${err}`);
    }
  } else {
    lines.push('- **Errors found:** none');
  }

  return lines.join('\n');
}

// ============================================================================
// Helpers
// ============================================================================

function truncateValue(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.substring(0, maxLength - 3) + '...';
}
