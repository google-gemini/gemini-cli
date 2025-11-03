/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ToolCallConfirmationDetails,
  ToolInvocation,
  ToolResult,
} from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolConfirmationOutcome,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { ToolErrorType } from './tool-error.js';
import { getErrorMessage } from '../utils/errors.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../config/config.js';
import { HF_IMAGE_GEN_TOOL_NAME } from './tool-names.js';
import { loadHfApiKey } from '../core/hfApiKeyStorage.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const HF_API_URL = 'https://api-inference.huggingface.co/models/';
const REQUEST_TIMEOUT_MS = 60000; // 60 seconds for image generation

/**
 * Parameters for the HuggingFace Image Generation tool
 */
export interface HfImageGenToolParams {
  /**
   * The text prompt describing the image to generate
   */
  prompt: string;
  /**
   * The model to use for generation (default: black-forest-labs/FLUX.1-schnell)
   */
  model?: string;
  /**
   * The output filename (will be saved in project temp directory)
   */
  filename?: string;
}

class HfImageGenToolInvocation extends BaseToolInvocation<
  HfImageGenToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: HfImageGenToolParams,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const displayPrompt =
      this.params.prompt.length > 100
        ? this.params.prompt.substring(0, 97) + '...'
        : this.params.prompt;
    return `Generating image with prompt: "${displayPrompt}"`;
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // Legacy confirmation flow (no message bus OR policy decision was ASK_USER)
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: `Confirm HuggingFace Image Generation`,
      prompt: `Generate image: "${this.params.prompt}" using model: ${this.params.model || 'black-forest-labs/FLUX.1-schnell'}`,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    // Load API key
    const apiKey = await loadHfApiKey();
    if (!apiKey) {
      const errorMessage =
        'HuggingFace API key not found. Please set it using the /hfkey command.';
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }

    const model = this.params.model || 'black-forest-labs/FLUX.1-schnell';
    const filename = this.params.filename || 'generated_image.png';

    try {
      // Create timeout for the request
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(
        () => timeoutController.abort(),
        REQUEST_TIMEOUT_MS,
      );

      // Combine both abort signals
      const combinedSignal = signal.aborted ? signal : timeoutController.signal;

      try {
        // Make request to HuggingFace API
        const response = await fetch(`${HF_API_URL}${model}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: this.params.prompt,
          }),
          signal: combinedSignal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `HuggingFace API request failed with status ${response.status}: ${errorText}`,
          );
        }

        // Get image data as buffer
        const imageBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(imageBuffer);

        // Save to project temp directory
        const tempDir = this.config.storage.getProjectTempDir();
        fs.mkdirSync(tempDir, { recursive: true });

        const outputPath = path.join(tempDir, filename);
        fs.writeFileSync(outputPath, buffer);

        const successMessage = `Image generated and saved to: ${outputPath}`;
        return {
          llmContent: successMessage,
          returnDisplay: successMessage,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: unknown) {
      const errorMessage = `Error generating image: ${getErrorMessage(error)}`;
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

/**
 * Implementation of the HuggingFace Image Generation tool
 */
export class HfImageGenTool extends BaseDeclarativeTool<
  HfImageGenToolParams,
  ToolResult
> {
  static readonly Name = HF_IMAGE_GEN_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus?: MessageBus,
  ) {
    super(
      HfImageGenTool.Name,
      'HuggingFace Image Generation',
      'Generate images from text prompts using HuggingFace models. Supports FLUX.1-schnell and other text-to-image models. Free tier provides 100 images per day. Requires HuggingFace API key (set with /hfkey command).',
      Kind.Other,
      {
        properties: {
          prompt: {
            description:
              'A detailed text description of the image to generate (e.g., "a cat sitting on a windowsill at sunset")',
            type: 'string',
          },
          model: {
            description:
              'The HuggingFace model to use for generation. Default is "black-forest-labs/FLUX.1-schnell". Other options include "stabilityai/stable-diffusion-2-1", "runwayml/stable-diffusion-v1-5".',
            type: 'string',
          },
          filename: {
            description:
              'The output filename for the generated image (e.g., "cat.png"). Will be saved in the project temp directory. Default is "generated_image.png".',
            type: 'string',
          },
        },
        required: ['prompt'],
        type: 'object',
      },
      false, // isOutputMarkdown
      false, // canUpdateOutput
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: HfImageGenToolParams,
  ): string | null {
    if (!params.prompt || params.prompt.trim() === '') {
      return "The 'prompt' parameter cannot be empty.";
    }

    if (params.filename) {
      // Validate filename doesn't contain path separators
      if (params.filename.includes('/') || params.filename.includes('\\')) {
        return "The 'filename' parameter should be a filename only, not a path.";
      }
      // Validate has an image extension
      if (
        !params.filename.endsWith('.png') &&
        !params.filename.endsWith('.jpg') &&
        !params.filename.endsWith('.jpeg')
      ) {
        return "The 'filename' must end with .png, .jpg, or .jpeg";
      }
    }

    return null;
  }

  protected createInvocation(
    params: HfImageGenToolParams,
    messageBus?: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<HfImageGenToolParams, ToolResult> {
    return new HfImageGenToolInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
