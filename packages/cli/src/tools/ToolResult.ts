/**
 * Standard tool result interface that all tools should implement
 */
export interface ToolResult {
  /**
   * Content meant to be included in LLM history.
   * This should represent the factual outcome of the tool execution.
   */
  llmContent: string;

  /**
   * Markdown string for user display.
   * This provides a user-friendly summary or visualization of the result.
   */
  returnDisplay: ToolResultDisplay;
}

export type ToolResultDisplay = string | FileDiff;

export interface FileDiff {
  fileDiff: string
}
