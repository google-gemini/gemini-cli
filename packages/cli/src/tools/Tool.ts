import { FunctionDeclaration } from "@google/genai";
import { ToolResult } from "./ToolResult.js";
import { ToolCallConfirmationDetails } from "../ui/types.js";

/**
 * Interface representing the base Tool functionality
 */
export interface Tool<TParams = unknown, TResult extends ToolResult = ToolResult> {
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
  shouldConfirmExecute(params: TParams): Promise<ToolCallConfirmationDetails | false>;
  
  /**
   * Executes the tool with the given parameters
   * @param params Parameters for the tool execution
   * @returns Result of the tool execution
   */
  execute(params: TParams): Promise<TResult>;
}
