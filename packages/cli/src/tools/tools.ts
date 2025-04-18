import { FunctionDeclaration, Schema } from '@google/genai';
import { ToolCallConfirmationDetails } from '../ui/types.js';

/**
 * Interface representing the base Tool functionality
 */
export interface Tool<
  TParams = unknown,
  TResult extends ToolResult = ToolResult,
> {
  /**
   * The internal name of the tool (used for API calls)
   */
  name: string;

  /**
   * The user-friendly display name of the tool
   */
  displayName: string;

  /**
   * Description of what the tool does
   */
  description: string;

  /**
   * Function declaration schema from @google/genai
   */
  schema: FunctionDeclaration;

  /**
   * Validates the parameters for the tool
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  invalidParams(params: TParams): string | null;

  /**
   * Gets a pre-execution description of the tool operation
   * @param params Parameters for the tool execution
   * @returns A markdown string describing what the tool will do
   * Optional for backward compatibility
   */
  getDescription(params: TParams): string;

  /**
   * Determines if the tool should prompt for confirmation before execution
   * @param params Parameters for the tool execution
   * @returns Whether execute should be confirmed.
   */
  shouldConfirmExecute(
    params: TParams,
  ): Promise<ToolCallConfirmationDetails | false>;

  /**
   * Executes the tool with the given parameters
   * @param params Parameters for the tool execution
   * @returns Result of the tool execution
   */
  execute(params: TParams): Promise<TResult>;
}

/**
 * Base implementation for tools with common functionality
 */
export abstract class BaseTool<
  TParams = unknown,
  TResult extends ToolResult = ToolResult,
> implements Tool<TParams, TResult>
{
  /**
   * Creates a new instance of BaseTool
   * @param name Internal name of the tool (used for API calls)
   * @param displayName User-friendly display name of the tool
   * @param description Description of what the tool does
   * @param parameterSchema JSON Schema defining the parameters
   */
  constructor(
    readonly name: string,
    readonly displayName: string,
    readonly description: string,
    readonly parameterSchema: Record<string, unknown>,
  ) {}

  /**
   * Function declaration schema computed from name, description, and parameterSchema
   */
  get schema(): FunctionDeclaration {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameterSchema as Schema,
    };
  }

  /**
   * Validates the parameters for the tool
   * This is a placeholder implementation and should be overridden
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  invalidParams(params: TParams): string | null {
    // Implementation would typically use a JSON Schema validator
    // This is a placeholder that should be implemented by derived classes
    return null;
  }

  /**
   * Gets a pre-execution description of the tool operation
   * Default implementation that should be overridden by derived classes
   * @param params Parameters for the tool execution
   * @returns A markdown string describing what the tool will do
   */
  getDescription(params: TParams): string {
    return JSON.stringify(params);
  }

  /**
   * Determines if the tool should prompt for confirmation before execution
   * @param params Parameters for the tool execution
   * @returns Whether or not execute should be confirmed by the user.
   */
  shouldConfirmExecute(
    params: TParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    return Promise.resolve(false);
  }

  /**
   * Abstract method to execute the tool with the given parameters
   * Must be implemented by derived classes
   * @param params Parameters for the tool execution
   * @returns Result of the tool execution
   */
  abstract execute(params: TParams): Promise<TResult>;
}

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
  fileDiff: string;
}
