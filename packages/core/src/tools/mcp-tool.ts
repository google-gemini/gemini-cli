/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolMcpConfirmationDetails,
  Icon,
} from './tools.js';
import {
  CallableTool,
  Part,
  FunctionCall,
  FunctionDeclaration,
  Type,
} from '@google/genai';

type ToolParams = Record<string, unknown>;

export class DiscoveredMCPTool extends BaseTool<ToolParams, ToolResult> {
  private static readonly allowlist: Set<string> = new Set();
  readonly isCyclic: boolean;

  constructor(
    private readonly mcpTool: CallableTool,
    readonly serverName: string,
    readonly serverToolName: string,
    description: string,
    readonly parameterSchemaJson: unknown,
    readonly timeout?: number,
    readonly trust?: boolean,
    nameOverride?: string,
  ) {
    const isCyclic = hasCycleInSchema(parameterSchemaJson as object);
    const finalDescription = isCyclic
      ? `[DISABLED - CYCLIC SCHEMA] ${description}`
      : description;

    super(
      nameOverride ?? generateValidName(serverToolName),
      `${serverToolName} (${serverName} MCP Server)`,
      finalDescription,
      Icon.Hammer,
      { type: Type.OBJECT }, // this is a dummy Schema for MCP, will be not be used to construct the FunctionDeclaration
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );

    this.isCyclic = isCyclic;
    if (this.isCyclic) {
      console.warn(
        `Tool "${this.serverToolName}" from server "${this.serverName}" has a cyclic schema and will be disabled.`,
      );
    }
  }

  asFullyQualifiedTool(): DiscoveredMCPTool {
    return new DiscoveredMCPTool(
      this.mcpTool,
      this.serverName,
      this.serverToolName,
      this.description,
      this.parameterSchemaJson,
      this.timeout,
      this.trust,
      `${this.serverName}__${this.serverToolName}`,
    );
  }

  /**
   * Overrides the base schema to use parametersJsonSchema when building
   * FunctionDeclaration
   */
  override get schema(): FunctionDeclaration {
    return {
      name: this.name,
      description: this.description,
      parametersJsonSchema: this.parameterSchemaJson,
    };
  }

  async shouldConfirmExecute(
    _params: ToolParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const serverAllowListKey = this.serverName;
    const toolAllowListKey = `${this.serverName}.${this.serverToolName}`;

    if (this.trust) {
      return false; // server is trusted, no confirmation needed
    }

    if (
      DiscoveredMCPTool.allowlist.has(serverAllowListKey) ||
      DiscoveredMCPTool.allowlist.has(toolAllowListKey)
    ) {
      return false; // server and/or tool already allowlisted
    }

    const confirmationDetails: ToolMcpConfirmationDetails = {
      type: 'mcp',
      title: 'Confirm MCP Tool Execution',
      serverName: this.serverName,
      toolName: this.serverToolName, // Display original tool name in confirmation
      toolDisplayName: this.name, // Display global registry name exposed to model and user
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlwaysServer) {
          DiscoveredMCPTool.allowlist.add(serverAllowListKey);
        } else if (outcome === ToolConfirmationOutcome.ProceedAlwaysTool) {
          DiscoveredMCPTool.allowlist.add(toolAllowListKey);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    const functionCalls: FunctionCall[] = [
      {
        name: this.serverToolName,
        args: params,
      },
    ];

    const responseParts: Part[] = await this.mcpTool.callTool(functionCalls);

    return {
      llmContent: responseParts,
      returnDisplay: getStringifiedResultForDisplay(responseParts),
    };
  }
}

/**
 * Processes an array of `Part` objects, primarily from a tool's execution result,
 * to generate a user-friendly string representation, typically for display in a CLI.
 *
 * The `result` array can contain various types of `Part` objects:
 * 1. `FunctionResponse` parts:
 *    - If the `response.content` of a `FunctionResponse` is an array consisting solely
 *      of `TextPart` objects, their text content is concatenated into a single string.
 *      This is to present simple textual outputs directly.
 *    - If `response.content` is an array but contains other types of `Part` objects (or a mix),
 *      the `content` array itself is preserved. This handles structured data like JSON objects or arrays
 *      returned by a tool.
 *    - If `response.content` is not an array or is missing, the entire `functionResponse`
 *      object is preserved.
 * 2. Other `Part` types (e.g., `TextPart` directly in the `result` array):
 *    - These are preserved as is.
 *
 * All processed parts are then collected into an array, which is JSON.stringify-ed
 * with indentation and wrapped in a markdown JSON code block.
 */
function getStringifiedResultForDisplay(result: Part[]) {
  if (!result || result.length === 0) {
    return '```json\n[]\n```';
  }

  const processFunctionResponse = (part: Part) => {
    if (part.functionResponse) {
      const responseContent = part.functionResponse.response?.content;
      if (responseContent && Array.isArray(responseContent)) {
        // Check if all parts in responseContent are simple TextParts
        const allTextParts = responseContent.every(
          (p: Part) => p.text !== undefined,
        );
        if (allTextParts) {
          return responseContent.map((p: Part) => p.text).join('');
        }
        // If not all simple text parts, return the array of these content parts for JSON stringification
        return responseContent;
      }

      // If no content, or not an array, or not a functionResponse, stringify the whole functionResponse part for inspection
      return part.functionResponse;
    }
    return part; // Fallback for unexpected structure or non-FunctionResponsePart
  };

  const processedResults =
    result.length === 1
      ? processFunctionResponse(result[0])
      : result.map(processFunctionResponse);
  if (typeof processedResults === 'string') {
    return processedResults;
  }

  return '```json\n' + JSON.stringify(processedResults, null, 2) + '\n```';
}

/** Visible for testing */
export function generateValidName(name: string) {
  // Replace invalid characters (based on 400 error message from Gemini API) with underscores
  let validToolname = name.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // If longer than 63 characters, replace middle with '___'
  // (Gemini API says max length 64, but actual limit seems to be 63)
  if (validToolname.length > 63) {
    validToolname =
      validToolname.slice(0, 28) + '___' + validToolname.slice(-32);
  }
  return validToolname;
}

/**
 * Detects cycles in a JSON schemas due to `$ref`s.
 * Visible for testing.
 * @param schema The root of the JSON schema.
 * @returns `true` if a cycle is detected, `false` otherwise.
 */
export function hasCycleInSchema(schema: object): boolean {
  function resolveRef(ref: string): object | null {
    if (!ref.startsWith('#/')) {
      return null;
    }
    const path = ref.substring(2).split('/');
    let current: unknown = schema;
    for (const segment of path) {
      if (
        typeof current !== 'object' ||
        current === null ||
        !Object.prototype.hasOwnProperty.call(current, segment)
      ) {
        return null;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current as object;
  }

  function traverse(node: unknown, visitedRefs: Set<string>, pathRefs: Set<string>): boolean {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) {
      return false;
    }

    if ('$ref' in node && typeof node.$ref === 'string') {
      const ref = node.$ref;
      if (ref === '#/' || pathRefs.has(ref)) {  // A ref to just '#/' is always a cycle.
        return true; // Cycle detected!
      }
      if (visitedRefs.has(ref)) {
        return false; // Bail early, we have checked this ref before.
      }

      const resolvedNode = resolveRef(ref);
      if (resolvedNode) {
        // Add it to both visited and the current path
        visitedRefs.add(ref);
        pathRefs.add(ref);
        const hasCycle = traverse(resolvedNode, visitedRefs, pathRefs);
        pathRefs.delete(ref); // Backtrack, leaving it in visited
        return hasCycle;
      }
    }

    // Crawl all the properties of node
    for (const key in node) {
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        if (traverse((node as Record<string, unknown>)[key], visitedRefs, pathRefs)) {
          return true;
        }
      }
    }

    return false;
  }

  return traverse(schema, new Set<string>(), new Set<string>());
}
