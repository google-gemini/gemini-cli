/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FunctionDeclaration, PartListUnion } from '@google/genai';
import { ToolErrorType } from './tool-error.js';
import type { GrepMatch } from './grep-utils.js';
import type { DiffUpdateResult } from '../ide/ide-client.js';
import type { ShellExecutionConfig } from '../services/shellExecutionService.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { isRecord } from '../utils/markdownUtils.js';
import { randomUUID } from 'node:crypto';
import {
  MessageBusType,
  type ToolConfirmationRequest,
  type ToolConfirmationResponse,
  type Question,
} from '../confirmation-bus/types.js';
import { ApprovalMode } from '../policy/types.js';
import type { SubagentProgress } from '../agents/types.js';

/**
/**
 * Supported decisions for forcing tool execution behavior.
 */
export type ForcedToolDecision = 'allow' | 'deny' | 'ask_user';

/**
 * Options bag for tool execution, replacing positional parameters that are
 * only relevant to specific tool types.
 */
export interface ExecuteOptions {
  abortSignal: AbortSignal;
  updateOutput?: (output: ToolLiveOutput) => void;
  shellExecutionConfig?: ShellExecutionConfig;
  setExecutionIdCallback?: (executionId: number) => void;
}

/**
 * Represents a validated and ready-to-execute tool call.
 * An instance of this is created by a `ToolBuilder`.
 */
export interface ToolInvocation<
  TParams extends object,
  TResult extends ToolResult,
> {
  /**
   * The validated parameters for this specific invocation.
   */
  params: TParams;

  /**
   * Gets a pre-execution description of the tool operation.
   *
   * @returns A markdown string describing what the tool will do.
   */
  getDescription(): string;

  /**
   * Gets a clean title for display in the UI (e.g. the raw command without metadata).
   * If not implemented, the UI may fall back to getDescription().
   * @returns A string representing the tool call title.
   */
  getDisplayTitle?(): string;

  /**
   * Gets conversational explanation or secondary metadata.
   * @returns A string representing the explanation, or undefined.
   */
  getExplanation?(): string;

  /**
   * Determines what file system paths the tool will affect.
   * @returns A list of such paths.
   */
  toolLocations(): ToolLocation[];

  /**
   * Checks if the tool call should be confirmed by the user before execution.
   *
   * @param abortSignal An AbortSignal that can be used to cancel the confirmation request.
   * @returns A ToolCallConfirmationDetails object if confirmation is required, or false if not.
   */
  shouldConfirmExecute(
    abortSignal: AbortSignal,
    forcedDecision?: ForcedToolDecision,
  ): Promise<ToolCallConfirmationDetails | false>;

  /**
   * Executes the tool with the validated parameters.
   * @param options Options for tool execution including signal and output updates.
   * @returns Result of the tool execution.
   */
  execute(options: ExecuteOptions): Promise<TResult>;

  /**
   * Returns tool-specific options for policy updates.
   * This is used by the scheduler to narrow policy rules when a tool is approved.
   */
  getPolicyUpdateOptions?(
    outcome: ToolConfirmationOutcome,
  ): PolicyUpdateOptions | undefined;
}

/**
 * Structured payload used by tools to surface background execution metadata to
 * the CLI UI.
 *
 * NOTE: `pid` is used as the canonical identifier for now to stay consistent
 * with existing types (ExecutingToolCall.pid, ExecutionHandle.pid, etc.).
 * A future rename to `executionId` is planned once the codebase is fully
 * migrated — not done in this PR to keep the diff focused on the abstraction.
 */
export interface BackgroundExecutionData extends Record<string, unknown> {
  pid?: number;
  command?: string;
  initialOutput?: string;
}

export function isBackgroundExecutionData(
  data: unknown,
): data is BackgroundExecutionData {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const pid = 'pid' in data ? data.pid : undefined;
  const command = 'command' in data ? data.command : undefined;
  const initialOutput =
    'initialOutput' in data ? data.initialOutput : undefined;

  return (
    (pid === undefined || typeof pid === 'number') &&
    (command === undefined || typeof command === 'string') &&
    (initialOutput === undefined || typeof initialOutput === 'string')
  );
}

/**
 * Options for policy updates that can be customized by tool invocations.
 */
export interface PolicyUpdateOptions {
  argsPattern?: string;
  commandPrefix?: string | string[];
  mcpName?: string;
  toolName?: string;
  allowRedirection?: boolean;
}

/**
 * A convenience base class for ToolInvocation.
 */
export abstract class BaseToolInvocation<
  TParams extends object,
  TResult extends ToolResult,
> implements ToolInvocation<TParams, TResult>
{
  constructor(
    readonly params: TParams,
    protected readonly messageBus: MessageBus,
    readonly _toolName?: string,
    readonly _toolDisplayName?: string,
    readonly _serverName?: string,
    readonly _toolAnnotations?: Record<string, unknown>,
    readonly respectsAutoEdit: boolean = false,
    readonly getApprovalMode: () => ApprovalMode = () => ApprovalMode.DEFAULT,
  ) {}

  abstract getDescription(): string;

  getDisplayTitle(): string {
    return this.getDescription();
  }

  getExplanation(): string {
    return '';
  }

  toolLocations(): ToolLocation[] {
    return [];
  }

  async shouldConfirmExecute(
    abortSignal: AbortSignal,
    forcedDecision?: ForcedToolDecision,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (
      this.respectsAutoEdit &&
      this.getApprovalMode() === ApprovalMode.AUTO_EDIT &&
      forcedDecision !== 'ask_user'
    ) {
      return false;
    }

    const decision =
      forcedDecision ?? (await this.getMessageBusDecision(abortSignal));
    if (decision === 'allow') {
      return false;
    }

    if (decision === 'deny') {
      throw new Error(
        `Tool execution for "${
          this._toolDisplayName || this._toolName
        }" denied by policy.`,
      );
    }

    if (decision === 'ask_user') {
      return this.getConfirmationDetails(abortSignal);
    }

    // Default to confirmation details if decision is unknown (should not happen with exhaustive policy)
    return this.getConfirmationDetails(abortSignal);
  }

  /**
   * Returns tool-specific options for policy updates.
   * Subclasses can override this to provide additional options like
   * commandPrefix (for shell) or mcpName (for MCP tools).
   */
  getPolicyUpdateOptions(
    _outcome: ToolConfirmationOutcome,
  ): PolicyUpdateOptions | undefined {
    return undefined;
  }

  /**
   * Helper method to publish a policy update when user selects
   * ProceedAlways or ProceedAlwaysAndSave.
   */
  protected async publishPolicyUpdate(
    outcome: ToolConfirmationOutcome,
  ): Promise<void> {
    if (
      outcome === ToolConfirmationOutcome.ProceedAlways ||
      outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave
    ) {
      if (this._toolName) {
        const options = this.getPolicyUpdateOptions(outcome);
        void this.messageBus.publish({
          type: MessageBusType.UPDATE_POLICY,
          toolName: this._toolName,
          persist: outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave,
          ...options,
        });
      }
    }
  }

  /**
   * Subclasses should override this method to provide custom confirmation UI
   * when the policy engine's decision is 'ask_user'.
   * The base implementation provides a generic confirmation prompt.
   */
  protected async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (!this.messageBus) {
      return false;
    }

    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: `Confirm: ${this._toolDisplayName || this._toolName}`,
      prompt: this.getDescription(),
      onConfirm: async (_outcome: ToolConfirmationOutcome) => {
        // Policy updates are now handled centrally by the scheduler
      },
    };
    return confirmationDetails;
  }

  protected getMessageBusDecision(
    abortSignal: AbortSignal,
    forcedDecision?: ForcedToolDecision,
  ): Promise<ForcedToolDecision> {
    if (!this.messageBus || !this._toolName) {
      // If there's no message bus, we can't make a decision, so we allow.
      // The legacy confirmation flow will still apply if the tool needs it.
      return Promise.resolve('allow');
    }

    const correlationId = randomUUID();
    const request: ToolConfirmationRequest = {
      type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
      correlationId,
      toolCall: {
        name: this._toolName,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        args: this.params as Record<string, unknown>,
      },
      serverName: this._serverName,
      toolAnnotations: this._toolAnnotations,
      forcedDecision,
    };

    return new Promise<ForcedToolDecision>((resolve) => {
      if (!this.messageBus) {
        resolve('allow');
        return;
      }

      let timeoutId: NodeJS.Timeout | null = null;
      let unsubscribe: (() => void) | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        abortSignal.removeEventListener('abort', abortHandler);
      };

      const abortHandler = () => {
        cleanup();
        resolve('deny');
      };

      if (abortSignal.aborted) {
        resolve('deny');
        return;
      }

      const responseHandler = (response: ToolConfirmationResponse) => {
        if (response.correlationId === correlationId) {
          cleanup();
          if (response.requiresUserConfirmation) {
            resolve('ask_user');
          } else if (response.confirmed) {
            resolve('allow');
          } else {
            resolve('deny');
          }
        }
      };

      abortSignal.addEventListener('abort', abortHandler, { once: true });

      timeoutId = setTimeout(() => {
        cleanup();
        resolve('ask_user'); // Default to ask_user on timeout
      }, 30000);

      this.messageBus.subscribe(
        MessageBusType.TOOL_CONFIRMATION_RESPONSE,
        responseHandler,
      );
      unsubscribe = () => {
        this.messageBus?.unsubscribe(
          MessageBusType.TOOL_CONFIRMATION_RESPONSE,
          responseHandler,
        );
      };

      try {
        void this.messageBus.publish(request);
      } catch {
        cleanup();
        resolve('allow');
      }
    });
  }

  abstract execute(options: ExecuteOptions): Promise<TResult>;

  toJSON() {
    return {
      params: this.params,
    };
  }
}

/**
 * A type alias for a tool invocation where the specific parameter and result types are not known.
 */
export type AnyToolInvocation = ToolInvocation<object, ToolResult>;

/**
 * Interface for a tool builder that validates parameters and creates invocations.
 */
export interface ToolBuilder<
  TParams extends object,
  TResult extends ToolResult,
> {
  /**
   * The internal name of the tool (used for API calls).
   */
  name: string;

  /**
   * The user-friendly display name of the tool.
   */
  displayName: string;

  /**
   * Description of what the tool does.
   */
  description: string;

  /**
   * The kind of tool for categorization and permissions
   */
  kind: Kind;

  /**
   * Function declaration schema from @google/genai.
   * @param modelId Optional model identifier to get a model-specific schema.
   */
  getSchema(modelId?: string): FunctionDeclaration;

  /**
   * Function declaration schema for the default model.
   * @deprecated Use getSchema(modelId) for model-specific schemas.
   */
  readonly schema: FunctionDeclaration;

  /**
   * Whether the tool's output should be rendered as markdown.
   */
  isOutputMarkdown: boolean;

  /**
   * Whether the tool supports live (streaming) output.
   */
  canUpdateOutput: boolean;

  /**
   * Whether the tool is read-only (has no side effects).
   */
  isReadOnly: boolean;

  /**
   * Validates raw parameters and builds a ready-to-execute invocation.
   * @param params The raw, untrusted parameters from the model.
   * @returns A valid `ToolInvocation` if successful. Throws an error if validation fails.
   */
  build(params: TParams): ToolInvocation<TParams, TResult>;
}

/**
 * Represents the expected JSON Schema structure for tool parameters.
 */
export interface ToolParameterSchema {
  type: string;
  properties?: unknown;
  [key: string]: unknown;
}

/**
 * New base class for tools that separates validation from execution.
 * New tools should extend this class.
 */
export abstract class DeclarativeTool<
  TParams extends object,
  TResult extends ToolResult,
> implements ToolBuilder<TParams, TResult>
{
  constructor(
    readonly name: string,
    readonly displayName: string,
    readonly description: string,
    readonly kind: Kind,
    readonly parameterSchema: unknown,
    readonly messageBus: MessageBus,
    readonly isOutputMarkdown: boolean = true,
    readonly canUpdateOutput: boolean = false,
    readonly extensionName?: string,
    readonly extensionId?: string,
  ) {}

  clone(messageBus?: MessageBus): this {
    // Note: we cannot use structuredClone() here because it does not preserve
    // prototype chains or handle non-serializable properties (like functions).
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const cloned = Object.assign(
      // eslint-disable-next-line no-restricted-syntax
      Object.create(Object.getPrototypeOf(this)),
      this,
    ) as this;
    if (messageBus) {
      Object.defineProperty(cloned, 'messageBus', {
        value: messageBus,
        writable: false,
        configurable: true,
      });
    }
    return cloned;
  }

  toJSON() {
    return {
      name: this.name,
      displayName: this.displayName,
      description: this.description,
      kind: this.kind,
      parameterSchema: this.parameterSchema,
    };
  }

  get isReadOnly(): boolean {
    return READ_ONLY_KINDS.includes(this.kind);
  }

  get toolAnnotations(): Record<string, unknown> | undefined {
    return undefined;
  }

  getSchema(_modelId?: string): FunctionDeclaration {
    return {
      name: this.name,
      description: this.description,
      parametersJsonSchema: this.addWaitForPreviousParameter(
        this.parameterSchema,
      ),
    };
  }

  /**
   * Type guard to check if an unknown value represents a ToolParameterSchema object.
   */
  private isParameterSchema(obj: unknown): obj is ToolParameterSchema {
    return isRecord(obj) && 'type' in obj;
  }

  /**
   * Adds the `wait_for_previous` parameter to the tool's schema.
   * This allows the model to explicitly control parallel vs sequential execution.
   */
  private addWaitForPreviousParameter(schema: unknown): unknown {
    if (!this.isParameterSchema(schema) || schema.type !== 'object') {
      return schema;
    }

    const props = schema.properties;
    let propertiesObj: Record<string, unknown> = {};

    if (props !== undefined) {
      if (!isRecord(props)) {
        // properties exists but is not an object, so it's a malformed schema.
        return schema;
      }
      propertiesObj = props;
    }

    return {
      ...schema,
      properties: {
        ...propertiesObj,
        wait_for_previous: {
          type: 'boolean',
          description:
            'Set to true to wait for all previously requested tools in this turn to complete before starting. Set to false (or omit) to run in parallel. Use true when this tool depends on the output of previous tools.',
        },
      },
    };
  }

  get schema(): FunctionDeclaration {
    return this.getSchema();
  }

  /**
   * Validates the raw tool parameters.
   * Subclasses should override this to add custom validation logic
   * beyond the JSON schema check.
   * @param params The raw parameters from the model.
   * @returns An error message string if invalid, null otherwise.
   */
  validateToolParams(_params: TParams): string | null {
    // Base implementation can be extended by subclasses.
    return null;
  }

  /**
   * The core of the new pattern. It validates parameters and, if successful,
   * returns a `ToolInvocation` object that encapsulates the logic for the
   * specific, validated call.
   * @param params The raw, untrusted parameters from the model.
   * @returns A `ToolInvocation` instance.
   */
  abstract build(params: TParams): ToolInvocation<TParams, TResult>;

  /**
   * A convenience method that builds and executes the tool in one step.
   * Throws an error if validation fails.
   * @param params The raw, untrusted parameters from the model.
   * @param signal AbortSignal for tool cancellation.
   * @param updateOutput Optional callback to stream output.
   * @returns The result of the tool execution.
   */
  async buildAndExecute(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: ToolLiveOutput) => void,
    options?: Omit<ExecuteOptions, 'abortSignal' | 'updateOutput'>,
  ): Promise<TResult> {
    const invocation = this.build(params);
    return invocation.execute({
      ...options,
      abortSignal: signal,
      updateOutput,
    });
  }

  /**
   * Similar to `build` but never throws.
   * @param params The raw, untrusted parameters from the model.
   * @returns A `ToolInvocation` instance.
   */
  private silentBuild(
    params: TParams,
  ): ToolInvocation<TParams, TResult> | Error {
    try {
      return this.build(params);
    } catch (e) {
      if (e instanceof Error) {
        return e;
      }
      return new Error(String(e));
    }
  }

  /**
   * A convenience method that builds and executes the tool in one step.
   * Never throws.
   * @param params The raw, untrusted parameters from the model.
   * @param abortSignal a signal to abort.
   * @returns The result of the tool execution.
   */
  async validateBuildAndExecute(
    params: TParams,
    abortSignal: AbortSignal,
  ): Promise<ToolResult> {
    const invocationOrError = this.silentBuild(params);
    if (invocationOrError instanceof Error) {
      const errorMessage = invocationOrError.message;
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${errorMessage}`,
        returnDisplay: errorMessage,
        error: {
          message: errorMessage,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    try {
      return await invocationOrError.execute({ abortSignal });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error: Tool call execution failed. Reason: ${errorMessage}`,
        returnDisplay: errorMessage,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

/**
 * New base class for declarative tools that separates validation from execution.
 * New tools should extend this class, which provides a `build` method that
 * validates parameters before deferring to a `createInvocation` method for
 * the final `ToolInvocation` object instantiation.
 */
export abstract class BaseDeclarativeTool<
  TParams extends object,
  TResult extends ToolResult,
> extends DeclarativeTool<TParams, TResult> {
  build(params: TParams): ToolInvocation<TParams, TResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      throw new Error(validationError);
    }
    return this.createInvocation(
      params,
      this.messageBus,
      this.name,
      this.displayName,
    );
  }

  override validateToolParams(params: TParams): string | null {
    const errors = SchemaValidator.validate(
      this.schema.parametersJsonSchema,
      params,
    );

    if (errors) {
      return errors;
    }
    return this.validateToolParamValues(params);
  }

  protected validateToolParamValues(_params: TParams): string | null {
    // Base implementation can be extended by subclasses.
    return null;
  }

  protected abstract createInvocation(
    params: TParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<TParams, TResult>;
}

/**
 * A type alias for a declarative tool where the specific parameter and result types are not known.
 */
export type AnyDeclarativeTool = DeclarativeTool<object, ToolResult>;

/**
 * Type guard to check if an object is a Tool.
 * @param obj The object to check.
 * @returns True if the object is a Tool, false otherwise.
 */
export function isTool(obj: unknown): obj is AnyDeclarativeTool {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    'build' in obj &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    typeof (obj as AnyDeclarativeTool).build === 'function'
  );
}

export interface ToolResult {
  /**
   * Content meant to be included in LLM history.
   * This should represent the factual outcome of the tool execution.
   */
  llmContent: PartListUnion;

  /**
   * Markdown string for user display.
   * This provides a user-friendly summary or visualization of the result.
   * NOTE: This might also be considered UI-specific and could potentially be
   * removed or modified in a further refactor if the server becomes purely API-driven.
   * For now, we keep it as the core logic in ReadFileTool currently produces it.
   */
  returnDisplay: ToolResultDisplay;

  /**
   * If this property is present, the tool call is considered a failure.
   */
  error?: {
    message: string; // raw error message
    type?: ToolErrorType; // An optional machine-readable error type (e.g., 'FILE_NOT_FOUND').
  };

  /**
   * Optional data payload for passing structured information back to the caller.
   */
  data?: Record<string, unknown>;

  /**
   * Optional request to execute another tool immediately after this one.
   * The result of this tail call will replace the original tool's response.
   */
  tailToolCallRequest?: {
    name: string;
    args: Record<string, unknown>;
  };
}

/**
 * Detects cycles in a JSON schemas due to `$ref`s.
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      current = (current as Record<string, unknown>)[segment];
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return current as object;
  }

  function traverse(
    node: unknown,
    visitedRefs: Set<string>,
    pathRefs: Set<string>,
  ): boolean {
    if (typeof node !== 'object' || node === null) {
      return false;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        if (traverse(item, visitedRefs, pathRefs)) {
          return true;
        }
      }
      return false;
    }

    if ('$ref' in node && typeof node.$ref === 'string') {
      const ref = node.$ref;
      if (ref === '#' || ref === '#/' || pathRefs.has(ref)) {
        // A ref to just '#/' is always a cycle.
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
        if (
          traverse(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            (node as Record<string, unknown>)[key],
            visitedRefs,
            pathRefs,
          )
        ) {
          return true;
        }
      }
    }

    return false;
  }

  return traverse(schema, new Set<string>(), new Set<string>());
}

export interface TodoList {
  todos: Todo[];
}

export type ToolLiveOutput = string | AnsiOutput | SubagentProgress;

export interface StructuredToolResult {
  summary: string;
}

export function isStructuredToolResult(
  obj: unknown,
): obj is StructuredToolResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'summary' in obj &&
    typeof obj.summary === 'string'
  );
}

export const hasSummary = (res: unknown): res is { summary: string } =>
  isStructuredToolResult(res);

export interface GrepResult extends StructuredToolResult {
  matches: GrepMatch[];
  payload?: string;
}

export interface ListDirectoryResult extends StructuredToolResult {
  files: string[];
  payload?: string;
}

export interface ReadManyFilesResult extends StructuredToolResult {
  files: string[];
  skipped?: Array<{ path: string; reason: string }>;
  include?: string[];
  excludes?: string[];
  targetDir?: string;
  payload?: string;
}

export const isGrepResult = (res: unknown): res is GrepResult =>
  isStructuredToolResult(res) && 'matches' in res && Array.isArray(res.matches);

export const isListResult = (
  res: unknown,
): res is ListDirectoryResult | ReadManyFilesResult =>
  isStructuredToolResult(res) && 'files' in res && Array.isArray(res.files);

export const isReadManyFilesResult = (
  res: unknown,
): res is ReadManyFilesResult => isListResult(res) && 'include' in res;
export type ToolResultDisplay =
  | string
  | FileDiff
  | AnsiOutput
  | TodoList
  | SubagentProgress
  | GrepResult
  | ListDirectoryResult
  | ReadManyFilesResult;

export type TodoStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'blocked';

export interface Todo {
  description: string;
  status: TodoStatus;
}

export interface FileDiff {
  fileDiff: string;
  fileName: string;
  filePath: string;
  originalContent: string | null;
  newContent: string;
  diffStat?: DiffStat;
  isNewFile?: boolean;
}

export const isFileDiff = (res: unknown): res is FileDiff =>
  typeof res === 'object' &&
  res !== null &&
  'fileDiff' in res &&
  'fileName' in res &&
  'filePath' in res;

export interface DiffStat {
  model_added_lines: number;
  model_removed_lines: number;
  model_added_chars: number;
  model_removed_chars: number;
  user_added_lines: number;
  user_removed_lines: number;
  user_added_chars: number;
  user_removed_chars: number;
}

export interface ToolEditConfirmationDetails {
  type: 'edit';
  title: string;
  systemMessage?: string;
  onConfirm: (
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
  ) => Promise<void>;
  fileName: string;
  filePath: string;
  fileDiff: string;
  originalContent: string | null;
  newContent: string;
  isModifying?: boolean;
  diffStat?: DiffStat;
  ideConfirmation?: Promise<DiffUpdateResult>;
}

export interface ToolEditConfirmationPayload {
  newContent: string;
}

export interface ToolAskUserConfirmationPayload {
  answers: { [questionIndex: string]: string };
}

export interface ToolExitPlanModeConfirmationPayload {
  /** Whether the user approved the plan */
  approved: boolean;
  /** If approved, the approval mode to use for implementation */
  approvalMode?: ApprovalMode;
  /** If rejected, the user's feedback */
  feedback?: string;
}

export type ToolConfirmationPayload =
  | ToolEditConfirmationPayload
  | ToolAskUserConfirmationPayload
  | ToolExitPlanModeConfirmationPayload;

export interface ToolSandboxExpansionConfirmationDetails {
  type: 'sandbox_expansion';
  systemMessage?: string;
  title: string;
  command: string;
  rootCommand: string;
  additionalPermissions: import('../services/sandboxManager.js').SandboxPermissions;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
}

export interface ToolExecuteConfirmationDetails {
  type: 'exec';
  title: string;
  systemMessage?: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
  command: string;
  rootCommand: string;
  rootCommands: string[];
  commands?: string[];
}

export interface ToolMcpConfirmationDetails {
  type: 'mcp';
  title: string;
  systemMessage?: string;
  serverName: string;
  toolName: string;
  toolDisplayName: string;
  toolArgs?: Record<string, unknown>;
  toolDescription?: string;
  toolParameterSchema?: unknown;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
}

export interface ToolInfoConfirmationDetails {
  type: 'info';
  title: string;
  systemMessage?: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
  prompt: string;
  urls?: string[];
}

export interface ToolAskUserConfirmationDetails {
  type: 'ask_user';
  title: string;
  systemMessage?: string;
  questions: Question[];
  onConfirm: (
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
  ) => Promise<void>;
}

export interface ToolExitPlanModeConfirmationDetails {
  type: 'exit_plan_mode';
  title: string;
  systemMessage?: string;
  planPath: string;
  onConfirm: (
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
  ) => Promise<void>;
}

export type ToolCallConfirmationDetails =
  | ToolSandboxExpansionConfirmationDetails
  | ToolEditConfirmationDetails
  | ToolExecuteConfirmationDetails
  | ToolMcpConfirmationDetails
  | ToolInfoConfirmationDetails
  | ToolAskUserConfirmationDetails
  | ToolExitPlanModeConfirmationDetails;

export enum ToolConfirmationOutcome {
  ProceedOnce = 'proceed_once',
  ProceedAlways = 'proceed_always',
  ProceedAlwaysAndSave = 'proceed_always_and_save',
  ProceedAlwaysServer = 'proceed_always_server',
  ProceedAlwaysTool = 'proceed_always_tool',
  ModifyWithEditor = 'modify_with_editor',
  Cancel = 'cancel',
}

export enum Kind {
  Read = 'read',
  Edit = 'edit',
  Delete = 'delete',
  Move = 'move',
  Search = 'search',
  Execute = 'execute',
  Think = 'think',
  Agent = 'agent',
  Fetch = 'fetch',
  Communicate = 'communicate',
  Plan = 'plan',
  SwitchMode = 'switch_mode',
  Other = 'other',
}

// Function kinds that have side effects
export const MUTATOR_KINDS: Kind[] = [
  Kind.Edit,
  Kind.Delete,
  Kind.Move,
  Kind.Execute,
] as const;

// Function kinds that are safe to run in parallel
export const READ_ONLY_KINDS: Kind[] = [
  Kind.Read,
  Kind.Search,
  Kind.Fetch,
] as const;

export interface ToolLocation {
  // Absolute path to the file
  path: string;
  // Which line (if known)
  line?: number;
}
