/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The core data interface for the Tool Alignment Dataset.
 * Designed to be extensible for custom error reports and metrics.
 */

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface NegativeExample {
  id?: string;
  tool_calls: ToolCall[];
  output_text?: string; // For "too chatty" or "hallucination" failures
  reason: string; // e.g., "Defaulted to shell 'cat'", "Included conversational filler"
  severity: 'low' | 'medium' | 'high'; // Helps the optimizer prioritize fixes
}

export interface Scenario {
  id: string; // Unique identifier (e.g., 'read_file-01')
  metadata: {
    tags: string[]; // e.g., ['tool-alignment', 'shell-avoidance']
    created_at: string;
    platform?: 'darwin' | 'linux' | 'win32'; // To handle platform-specific shell variations
    model_info?: {
      // Placeholder for future tracking
      name?: string;
      version?: string;
    };
  };
  input: {
    user_query: string;
    context?: {
      current_file?: string;
      directory_structure?: string[];
    };
  };
  expected: {
    tool_calls: ToolCall[];
    rationale: string; // Why this is the 'Golden' choice
  };
  negatives: NegativeExample[]; // Array of multiple failure modes
}
