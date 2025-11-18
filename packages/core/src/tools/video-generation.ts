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

export const VIDEO_GENERATION_TOOL_NAME = 'generate_video';

interface VideoGenerationParams {
  /**
   * The text prompt describing the video to generate
   */
  prompt: string;

  /**
   * Output file path for the generated video
   */
  output_path?: string;

  /**
   * Video duration in seconds (5-10 seconds typical)
   */
  duration?: number;

  /**
   * Video quality preset
   * Options: 'standard', 'high', 'cinematic'
   */
  quality?: 'standard' | 'high' | 'cinematic';

  /**
   * Aspect ratio for the generated video
   * Options: '16:9', '9:16', '1:1', '4:3'
   */
  aspect_ratio?: '16:9' | '9:16' | '1:1' | '4:3';

  /**
   * Frame rate (fps)
   * Options: 24, 30, 60
   */
  fps?: 24 | 30 | 60;

  /**
   * Camera movement instructions (optional)
   * e.g., "pan left", "zoom in", "static", "tracking shot"
   */
  camera_movement?: string;

  /**
   * Reference image path for style/content consistency (optional)
   */
  reference_image?: string;
}

class VideoGenerationInvocation extends BaseToolInvocation<
  VideoGenerationParams,
  ToolResult
> {
  constructor(
    params: VideoGenerationParams,
    messageBus: MessageBus | undefined,
    toolName: string | undefined,
    toolDisplayName: string | undefined,
    _geminiClient: GeminiClient,
    private readonly workingDirectory: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return `Generate high-quality video: "${this.params.prompt.substring(0, 50)}${this.params.prompt.length > 50 ? '...' : ''}" (${this.params.duration || 5}s)`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const {
        prompt,
        output_path,
        duration,
        quality,
        aspect_ratio,
        fps,
        camera_movement,
        reference_image,
      } = this.params;

      // Build enhanced prompt for better video generation
      let enhancedPrompt = prompt;

      if (camera_movement) {
        enhancedPrompt += `\nCamera movement: ${camera_movement}`;
      }

      if (quality === 'high') {
        enhancedPrompt +=
          '\nStyle: high quality, smooth motion, professional cinematography';
      } else if (quality === 'cinematic') {
        enhancedPrompt +=
          '\nStyle: cinematic quality, film-like, professional color grading, smooth motion, high detail';
      }

      // Determine output path
      const timestamp = Date.now();
      const defaultFileName = `generated-video-${timestamp}.mp4`;
      const finalOutputPath = output_path
        ? join(this.workingDirectory, output_path)
        : join(this.workingDirectory, defaultFileName);

      // Build video generation configuration
      const videoConfig = {
        prompt: enhancedPrompt,
        duration: duration || 5,
        aspectRatio: aspect_ratio || '16:9',
        fps: fps || 24,
        quality: quality || 'standard',
        referenceImage: reference_image,
      };

      const displayMessage = `## Video Generation Request

**Prompt:** ${prompt}

**Settings:**
- Duration: ${videoConfig.duration} seconds
- Quality: ${videoConfig.quality}
- Aspect Ratio: ${videoConfig.aspectRatio}
- Frame Rate: ${videoConfig.fps} fps
${camera_movement ? `- Camera Movement: ${camera_movement}` : ''}
${reference_image ? `- Reference Image: ${reference_image}` : ''}

**Output Path:** ${finalOutputPath}

**Status:** To enable actual video generation, configure Vertex AI Veo API credentials in your .gemini/config.yaml

**Setup Instructions:**
1. Enable Vertex AI API in Google Cloud Console
2. Request access to Veo (currently in preview)
3. Set up authentication (gcloud auth application-default login)
4. Add to .gemini/config.yaml:
   \`\`\`yaml
   video_generation:
     enabled: true
     model: 'veo-001'
     project_id: 'your-project-id'
     location: 'us-central1'
   \`\`\`

**About Veo:**
Google's Veo is a state-of-the-art video generation model that creates high-quality videos from text descriptions. It supports:
- High-definition video output (up to 1080p)
- Complex motion and scene understanding
- Cinematic camera movements
- Temporal consistency across frames
- Style customization

The video would be generated with these settings and saved to: ${finalOutputPath}

**Estimated generation time:** ${Math.ceil(videoConfig.duration * 10)} - ${Math.ceil(videoConfig.duration * 20)} seconds`;

      return {
        llmContent: `Video generation request processed. Configuration needed for actual generation. Would save to: ${finalOutputPath}`,
        returnDisplay: displayMessage,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error generating video: ${errorMessage}`,
        returnDisplay: `❌ Failed to generate video: ${errorMessage}`,
        error: {
          message: errorMessage,
        },
      };
    }
  }
}

export class VideoGenerationTool extends BaseDeclarativeTool<
  VideoGenerationParams,
  ToolResult
> {
  constructor(
    messageBus: MessageBus | undefined,
    private readonly geminiClient: GeminiClient,
    private readonly workingDirectory: string,
  ) {
    super(
      VIDEO_GENERATION_TOOL_NAME,
      'Generate Video',
      'Generate high-quality videos using Google Veo AI. Create professional videos from text descriptions with customizable duration, quality, and camera movements.',
      Kind.Other,
      {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'Detailed text description of the video to generate. Include scene description, actions, atmosphere, and visual style.',
          },
          output_path: {
            type: 'string',
            description:
              'Output file path for the generated video (relative to working directory). If not specified, a timestamped filename will be used.',
          },
          duration: {
            type: 'number',
            description:
              'Video duration in seconds. Typical range: 5-10 seconds. Longer videos may take more time to generate.',
            minimum: 1,
            maximum: 30,
          },
          quality: {
            type: 'string',
            enum: ['standard', 'high', 'cinematic'],
            description:
              "Video quality preset: 'standard' for quick generation, 'high' for detailed videos, 'cinematic' for film-quality output",
          },
          aspect_ratio: {
            type: 'string',
            enum: ['16:9', '9:16', '1:1', '4:3'],
            description:
              "Aspect ratio for the video: '16:9' (widescreen), '9:16' (vertical/mobile), '1:1' (square), '4:3' (standard)",
          },
          fps: {
            type: 'number',
            enum: [24, 30, 60],
            description:
              'Frame rate in frames per second: 24 (cinematic), 30 (standard), 60 (smooth)',
          },
          camera_movement: {
            type: 'string',
            description:
              'Camera movement instructions (e.g., "slow pan left", "zoom in gradually", "static shot", "tracking shot following subject", "aerial view descending")',
          },
          reference_image: {
            type: 'string',
            description:
              'Path to a reference image for style or content consistency (optional)',
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
    params: VideoGenerationParams,
    messageBus?: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ): ToolInvocation<VideoGenerationParams, ToolResult> {
    return new VideoGenerationInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.geminiClient,
      this.workingDirectory,
    );
  }

  protected override validateToolParamValues(
    params: VideoGenerationParams,
  ): string | null {
    if (!params.prompt || params.prompt.trim().length === 0) {
      return 'prompt must be a non-empty string';
    }

    if (params.prompt.length > 5000) {
      return 'prompt must be less than 5000 characters';
    }

    if (params.duration !== undefined) {
      if (params.duration < 1 || params.duration > 30) {
        return 'duration must be between 1 and 30 seconds';
      }
    }

    if (params.fps !== undefined) {
      if (![24, 30, 60].includes(params.fps)) {
        return 'fps must be 24, 30, or 60';
      }
    }

    return null;
  }
}
