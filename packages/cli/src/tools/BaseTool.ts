import type { FunctionDeclaration, Schema } from '@google/genai';
import { ToolResult } from './ToolResult.js';
import { Tool } from './Tool.js';
import { ToolCallConfirmationDetails } from '../ui/types.js';

/**
 * Base implementation for tools with common functionality
 */
export abstract class BaseTool<TParams = unknown, TResult extends ToolResult = ToolResult> implements Tool<TParams, TResult> {
  /**
   * Creates a new instance of BaseTool
   * @param name Internal name of the tool (used for API calls)
   * @param displayName User-friendly display name of the tool
   * @param description Description of what the tool does
   * @param parameterSchema JSON Schema defining the parameters
   */
  constructor(
    public readonly name: string,
    public readonly displayName: string,
    public readonly description: string,
    public readonly parameterSchema: Record<string, unknown>
  ) {}

  /**
   * Function declaration schema computed from name, description, and parameterSchema
   */
  get schema(): FunctionDeclaration {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameterSchema as Schema
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
  shouldConfirmExecute(params: TParams): Promise<ToolCallConfirmationDetails | false> {
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