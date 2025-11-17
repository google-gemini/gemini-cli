/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Explain Mode Type Definitions
 *
 * Tool usage transparency and educational annotations
 *
 * @module explain/types
 */

/**
 * Verbosity level for explanations
 */
export type VerbosityLevel = 'brief' | 'normal' | 'detailed';

/**
 * Explain mode configuration
 */
export interface ExplainConfig {
  /** Is explain mode enabled? */
  enabled: boolean;
  /** Verbosity level */
  verbosity: VerbosityLevel;
  /** Show tips? */
  showTips: boolean;
  /** Show reasoning? */
  showReasoning: boolean;
  /** Show tool usage? */
  showTools: boolean;
  /** Auto-enable for new users? */
  autoEnableForNewUsers: boolean;
}

/**
 * Tool execution explanation
 */
export interface ToolExplanation {
  /** Tool name */
  toolName: string;
  /** What the tool does */
  purpose: string;
  /** Why it was used */
  reason: string;
  /** Input to the tool */
  input?: string;
  /** Expected output */
  expectedOutput?: string;
  /** Educational tip */
  tip?: string;
  /** Related documentation */
  docLink?: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Explanation template for a tool
 */
export interface ExplanationTemplate {
  /** Tool name this applies to */
  toolName: string;
  /** Brief explanation (1 sentence) */
  brief: string;
  /** Normal explanation (2-3 sentences) */
  normal: string;
  /** Detailed explanation (multiple paragraphs) */
  detailed: string;
  /** Common use cases */
  useCases?: string[];
  /** Tips and best practices */
  tips?: string[];
  /** Documentation link */
  docLink?: string;
  /** Example usage */
  examples?: ExplanationExample[];
}

/**
 * Example usage in explanation
 */
export interface ExplanationExample {
  /** Example description */
  description: string;
  /** Input/command */
  input: string;
  /** Expected output */
  output: string;
  /** Explanation of what happened */
  explanation: string;
}

/**
 * Reasoning step
 */
export interface ReasoningStep {
  /** Step number */
  step: number;
  /** Step description */
  description: string;
  /** Tool used (if any) */
  tool?: string;
  /** Why this step */
  rationale?: string;
  /** Result of this step */
  result?: string;
}

/**
 * Complete explanation for an operation
 */
export interface OperationExplanation {
  /** Operation ID */
  id: string;
  /** What was requested */
  request: string;
  /** High-level approach */
  approach: string;
  /** Tools that will be/were used */
  tools: ToolExplanation[];
  /** Step-by-step reasoning */
  reasoning?: ReasoningStep[];
  /** Educational tips */
  tips?: string[];
  /** Timestamp */
  timestamp: number;
}

/**
 * Tip for user education
 */
export interface EducationalTip {
  /** Tip ID */
  id: string;
  /** Tip category */
  category: TipCategory;
  /** Tip content */
  content: string;
  /** When to show this tip */
  trigger: TipTrigger;
  /** Priority (higher = more important) */
  priority: number;
  /** Has user seen this? */
  seen?: boolean;
  /** Related documentation */
  docLink?: string;
}

/**
 * Tip category
 */
export type TipCategory =
  | 'getting-started'
  | 'best-practices'
  | 'performance'
  | 'security'
  | 'productivity'
  | 'troubleshooting';

/**
 * Tip trigger condition
 */
export type TipTrigger =
  | 'tool-usage' // When specific tool is used
  | 'error' // When error occurs
  | 'slow-operation' // When operation is slow
  | 'first-time' // First time doing something
  | 'repetitive' // User doing something repeatedly
  | 'random'; // Randomly show tip

/**
 * Explanation statistics
 */
export interface ExplainStats {
  /** Total explanations generated */
  totalExplanations: number;
  /** By tool */
  byTool: Record<string, number>;
  /** Tips shown */
  tipsShown: number;
  /** User engagement (clicked tips, etc.) */
  engagement: number;
  /** Average verbosity used */
  avgVerbosity: VerbosityLevel;
}
