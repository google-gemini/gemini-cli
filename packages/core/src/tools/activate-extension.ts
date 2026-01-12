/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type {
  ToolResult,
  ToolCallConfirmationDetails,
  ToolInvocation,
  ToolConfirmationOutcome,
} from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { Config } from '../config/config.js';
import { ACTIVATE_EXTENSION_TOOL_NAME } from './tool-names.js';
import { ToolErrorType } from './tool-error.js';
import { ExtensionScope } from '../utils/extensionLoader.js';

/**
 * Parameters for the ActivateExtension tool
 */
export interface ActivateExtensionToolParams {
  /**
   * The name of the extension to activate
   */
  name: string;
}

class ActivateExtensionToolInvocation extends BaseToolInvocation<
  ActivateExtensionToolParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: ActivateExtensionToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    return `Activate extension: ${this.params.name}`;
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (!this.messageBus) {
      return false;
    }

    const extensionName = this.params.name;
    const extension = this.config
      .getExtensionLoader()
      .getExtensions()
      .find((e) => e.name === extensionName);

    if (!extension) {
      return false;
    }

    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: `Activate Extension: ${extensionName}`,
      prompt: `You are about to enable the extension **${extensionName}**.`,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        await this.publishPolicyUpdate(outcome);
      },
    };
    return confirmationDetails;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const extensionName = this.params.name;

    const extensionLoader = this.config.getExtensionLoader();
    const extension = extensionLoader
      .getExtensions()
      .find((e) => e.name === extensionName);

    if (!extension) {
      const extensions = extensionLoader
        .getExtensions()
        .filter((e) => !e.isActive);
      const availableExtensions = extensions.map((s) => s.name).join(', ');
      const errorMessage = `Extension "${extensionName}" not found. Available disabled extensions are: ${availableExtensions}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    try {
      // Use Session scope for dynamic activation so it doesn't persist beyond this session
      await extensionLoader.enableExtension(
        extensionName,
        ExtensionScope.Session,
      );

      return {
        llmContent: `Extension "${extensionName}" activated successfully.`,
        returnDisplay: `Extension **${extensionName}** activated.`,
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        llmContent: `Error activating extension: ${message}`,
        returnDisplay: `Error activating extension: ${message}`,
        error: {
          message,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

/**
 * Implementation of the ActivateExtension tool logic
 */
export class ActivateExtensionTool extends BaseDeclarativeTool<
  ActivateExtensionToolParams,
  ToolResult
> {
  static readonly Name = ACTIVATE_EXTENSION_TOOL_NAME;

  constructor(
    private config: Config,
    messageBus: MessageBus,
  ) {
    const extensions = config.getExtensionLoader().getExtensions();
    const disabledExtensions = extensions.filter((e) => !e.isActive);
    const extensionNames = disabledExtensions.map((s) => s.name);

    let schema: z.ZodTypeAny;
    if (extensionNames.length === 0) {
      schema = z.object({
        name: z
          .string()
          .describe('No disabled extensions are currently available.'),
      });
    } else {
      schema = z.object({
        name: z
          .enum(extensionNames as [string, ...string[]])
          .describe('The name of the extension to activate.'),
      });
    }

    const availableExtensionsHint =
      extensionNames.length > 0
        ? ` (Available: ${extensionNames.map((n) => `'${n}'`).join(', ')})`
        : '';

    super(
      ActivateExtensionTool.Name,
      'Activate Extension',
      `Activates a disabled extension by name${availableExtensionsHint}. Use this when you need functionality provided by an extension that is currently disabled (not in your active tools).`,
      Kind.Other,
      zodToJsonSchema(schema),
      messageBus,
      true,
      false,
    );
  }

  protected createInvocation(
    params: ActivateExtensionToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<ActivateExtensionToolParams, ToolResult> {
    return new ActivateExtensionToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName ?? 'Activate Extension',
    );
  }
}
