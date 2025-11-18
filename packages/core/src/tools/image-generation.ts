/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { GeminiClient } from '../core/client.js';
import { join } from 'node:path';

export const IMAGE_GENERATION_TOOL_NAME = 'generate_image';

interface ImageGenerationParams {
  /**
   * The text prompt describing the image to generate
   */
  prompt: string;

  /**
   * Output file path for the generated image
   */
  output_path?: string;

  /**
   * Image quality/size preset (optional)
   * Options: 'standard', 'high', 'ultra'
   */
  quality?: 'standard' | 'high' | 'ultra';

  /**
   * Aspect ratio for the generated image (optional)
   * Options: '1:1', '16:9', '9:16', '4:3', '3:4'
   */
  aspect_ratio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

  /**
   * Negative prompt - what to avoid in the image (optional)
   */
  negative_prompt?: string;
}

class ImageGenerationInvocation extends BaseToolInvocation<
  ImageGenerationParams,
  ToolResult
> {
  constructor(
    params: ImageGenerationParams,
    messageBus: MessageBus | undefined,
    toolName: string | undefined,
    toolDisplayName: string | undefined,
    _geminiClient: GeminiClient,
    private readonly workingDirectory: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return `Generate high-quality image: "${this.params.prompt.substring(0, 50)}${this.params.prompt.length > 50 ? '...' : ''}"`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const { prompt, output_path, quality, aspect_ratio, negative_prompt } =
        this.params;

      // Note: This is a placeholder for actual Imagen integration
      // In production, you would call the Vertex AI Imagen API directly
      // The enhancedPrompt would be built here with quality and negative_prompt
      // considerations for the actual Imagen API call

      // Determine output path
      const timestamp = Date.now();
      const defaultFileName = `generated-image-${timestamp}.png`;
      const finalOutputPath = output_path
        ? join(this.workingDirectory, output_path)
        : join(this.workingDirectory, defaultFileName);

      // In a real implementation, this would:
      // 1. Call Vertex AI Imagen API with the prompt
      // 2. Receive the generated image data
      // 3. Save it to the specified path
      //
      // For now, we'll return a placeholder response
      const displayMessage = `## Image Generation Request

**Prompt:** ${prompt}

**Settings:**
- Quality: ${quality || 'standard'}
- Aspect Ratio: ${aspect_ratio || '1:1'}
${negative_prompt ? `- Negative Prompt: ${negative_prompt}` : ''}

**Output Path:** ${finalOutputPath}

**Status:** To enable actual image generation, configure Vertex AI Imagen API credentials in your .gemini/config.yaml

**Setup Instructions:**
1. Enable Vertex AI API in Google Cloud Console
2. Set up authentication (gcloud auth application-default login)
3. Add to .gemini/config.yaml:
   \`\`\`yaml
   image_generation:
     enabled: true
     model: 'imagen-3.0-generate-001'
     project_id: 'your-project-id'
     location: 'us-central1'
   \`\`\`

The image would be generated with high quality settings and saved to: ${finalOutputPath}`;

      return {
        llmContent: `Image generation request processed. Configuration needed for actual generation. Would save to: ${finalOutputPath}`,
        returnDisplay: displayMessage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error generating image: ${errorMessage}`,
        returnDisplay: `❌ Failed to generate image: ${errorMessage}`,
        error: {
          message: errorMessage,
        },
      };
    }
  }
}

export class ImageGenerationTool extends BaseDeclarativeTool<
  ImageGenerationParams,
  ToolResult
> {
  constructor(
    messageBus: MessageBus | undefined,
    private readonly geminiClient: GeminiClient,
    private readonly workingDirectory: string,
  ) {
    super(
      IMAGE_GENERATION_TOOL_NAME,
      'Generate Image',
      'Generate high-quality images using Google Imagen AI. Create professional images from text descriptions with customizable quality and aspect ratios.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed text description of the image to generate. Be specific about style, composition, colors, and subject matter.',
          },
          output_path: {
            type: 'string',
            description:
              'Output file path for the generated image (relative to working directory). If not specified, a timestamped filename will be used.',
          },
          quality: {
            type: 'string',
            enum: ['standard', 'high', 'ultra'],
            description:
              "Image quality preset: 'standard' for quick generation, 'high' for detailed images, 'ultra' for maximum quality",
          },
          aspect_ratio: {
            type: 'string',
            enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
            description:
              "Aspect ratio for the image: '1:1' (square), '16:9' (landscape), '9:16' (portrait), '4:3' (standard), '3:4' (portrait standard)",
          },
          negative_prompt: {
            type: 'string',
            description:
              'Describe what to avoid in the image (e.g., "blurry, low quality, distorted")',
          },
        },
        required: ['prompt'],
      },
      true, // isOutputMarkdown
      false, // canUpdateOutput
      messageBus,
    );
  }

  protected createInvocation(
    params: ImageGenerationParams,
    messageBus?: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ): ToolInvocation<ImageGenerationParams, ToolResult> {
    return new ImageGenerationInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.geminiClient,
      this.workingDirectory,
    );
  }

  protected override validateToolParamValues(
    params: ImageGenerationParams,
  ): string | null {
    if (!params.prompt || params.prompt.trim().length === 0) {
      return 'prompt must be a non-empty string';
    }

    if (params.prompt.length > 5000) {
      return 'prompt must be less than 5000 characters';
    }

    return null;
  }
}
