/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import * as fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import type { ToolInvocation, ToolLocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import type { Config } from '../config/config.js';
import {
  GENERATE_IMAGE_TOOL_NAME,
  GENERATE_IMAGE_DISPLAY_NAME,
} from './tool-names.js';
import { getSpecificMimeType } from '../utils/fileUtils.js';

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
export const DEFAULT_OUTPUT_DIR = 'generated-images';
const MAX_FILENAME_LENGTH = 32;
const MAX_INPUT_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GenerateImageParams {
  prompt: string;
  input_image?: string;
  output_path?: string;
  filename?: string;
  count?: number;
  return_to_context?: boolean;
  aspect_ratio?: string;
  size?: string;
  model?: string;
}

export interface ImageGenerationResult {
  success: boolean;
  filePaths: string[];
  mimeType: string;
  base64Data?: string;
  errors?: string[];
}

export interface GenerateImageOptions {
  config: Config;
  params: GenerateImageParams;
  cwd: string;
  signal: AbortSignal;
  updateOutput?: (output: string) => void;
}

interface GenerateImageApiParams {
  ai: GoogleGenAI;
  modelName: string;
  prompt: string;
  inputImageBase64?: string;
  inputImageMimeType?: string;
  aspectRatio?: string;
  size?: string;
  isEditing: boolean;
}

// ─── Image Generation Engine ─────────────────────────────────────────────────

/**
 * Creates a GoogleGenAI client for image generation using credentials from Config.
 * Uses a separate instance from the chat model's client since image generation
 * requires different models.
 */
export function createImageGenClient(config: Config): GoogleGenAI {
  const cgConfig = config.getContentGeneratorConfig();

  if (cgConfig?.vertexai) {
    return new GoogleGenAI({
      vertexai: true,
      project: process.env['GOOGLE_CLOUD_PROJECT'],
      location: process.env['GOOGLE_CLOUD_LOCATION'],
    });
  }

  return new GoogleGenAI({ apiKey: cgConfig?.apiKey });
}

function isValidBase64ImageData(data: string): boolean {
  if (!data || data.length < 1000) return false;
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  return base64Regex.test(data);
}

export function promptToFilename(prompt: string): string {
  let baseName = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, MAX_FILENAME_LENGTH);

  if (!baseName) {
    baseName = 'generated_image';
  }

  return baseName;
}

function mimeToExtension(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    case 'image/png':
    default:
      return '.png';
  }
}

/**
 * Generates a unique filename, appending a variation suffix for batches
 * and auto-incrementing if a file already exists at the target path.
 */
export function getUniqueFilename(
  outputDir: string,
  baseName: string,
  extension: string,
  variationIndex?: number,
): string {
  let filename: string;

  if (variationIndex !== undefined && variationIndex > 0) {
    filename = `${baseName}_v${variationIndex + 1}${extension}`;
  } else {
    filename = `${baseName}${extension}`;
  }

  if (!fs.existsSync(path.join(outputDir, filename))) {
    return filename;
  }

  // Auto-increment
  let counter = 1;
  while (true) {
    const suffix =
      variationIndex !== undefined && variationIndex > 0
        ? `_v${variationIndex + 1}_${counter}`
        : `_${counter}`;
    filename = `${baseName}${suffix}${extension}`;
    if (!fs.existsSync(path.join(outputDir, filename))) {
      return filename;
    }
    counter++;
  }
}

export function validateInputImage(
  inputImagePath: string,
  cwd: string,
): string | null {
  const resolved = path.isAbsolute(inputImagePath)
    ? inputImagePath
    : path.resolve(cwd, inputImagePath);

  if (!fs.existsSync(resolved)) {
    return `Image generation failed: Input image not found at '${inputImagePath}'.`;
  }

  const stat = fs.statSync(resolved);
  if (stat.size > MAX_INPUT_IMAGE_SIZE) {
    return 'Image generation failed: Input image exceeds 20MB size limit.';
  }

  const mime = getSpecificMimeType(resolved);
  if (!mime || !mime.startsWith('image/')) {
    return `Image generation failed: '${inputImagePath}' is not a supported image format. Supports PNG, JPEG, and WebP.`;
  }

  return null;
}

export function validateOutputPath(
  outputPath: string,
  cwd: string,
): string | null {
  const resolved = path.resolve(cwd, outputPath);
  const normalizedCwd = path.resolve(cwd);

  if (
    !resolved.startsWith(normalizedCwd + path.sep) &&
    resolved !== normalizedCwd
  ) {
    return 'Image generation failed: Output path must be within the current working directory.';
  }
  return null;
}

/**
 * Makes a single API call to generate an image.
 * Checks inlineData first, then falls back to base64-encoded text.
 */
async function callImageApi(
  params: GenerateImageApiParams,
): Promise<{ base64Data: string; mimeType: string } | null> {
  const {
    ai,
    modelName,
    prompt,
    inputImageBase64,
    inputImageMimeType,
    aspectRatio,
    size,
    isEditing,
  } = params;

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];

  if (inputImageBase64 && inputImageMimeType) {
    parts.push({
      inlineData: {
        data: inputImageBase64,
        mimeType: inputImageMimeType,
      },
    });
  }

  const imageConfig: Record<string, string> = {};
  if (size) {
    imageConfig['imageSize'] = size;
  }
  if (aspectRatio && (!isEditing || aspectRatio)) {
    imageConfig['aspectRatio'] = aspectRatio;
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    config: Object.keys(imageConfig).length > 0 ? { imageConfig } : undefined,
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData?.data && part.inlineData?.mimeType) {
        return {
          base64Data: part.inlineData.data,
          mimeType: part.inlineData.mimeType,
        };
      }
      if (part.text && isValidBase64ImageData(part.text)) {
        return {
          base64Data: part.text,
          mimeType: 'image/png',
        };
      }
    }
  }

  return null;
}

/**
 * Classifies an API error into a user-friendly message.
 * Auth errors are flagged separately so batch generation can abort immediately.
 */
function classifyApiError(error: unknown): {
  message: string;
  isAuthError: boolean;
} {
  const errorMessage =
    error instanceof Error ? error.message : String(error).toLowerCase();

  if (
    errorMessage.includes('api key not valid') ||
    errorMessage.includes('permission denied') ||
    errorMessage.includes('403')
  ) {
    return {
      message:
        'Image generation failed: Authentication error. Ensure your API key or Vertex AI credentials have access to image generation models.',
      isAuthError: true,
    };
  }

  if (
    errorMessage.includes('safety') ||
    errorMessage.includes('blocked') ||
    errorMessage.includes('SAFETY')
  ) {
    return {
      message:
        'Image generation failed: The prompt was blocked by safety filters. Please modify your prompt and try again.',
      isAuthError: false,
    };
  }

  if (errorMessage.includes('quota') || errorMessage.includes('429')) {
    return {
      message:
        'Image generation failed: API quota exceeded. Check your Google Cloud console for quota details.',
      isAuthError: false,
    };
  }

  if (errorMessage.includes('500')) {
    return {
      message:
        'Image generation failed: Internal service error. Please try again.',
      isAuthError: false,
    };
  }

  if (
    errorMessage.includes('ENOTFOUND') ||
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('network')
  ) {
    return {
      message:
        'Image generation failed: Network error. Check your internet connection.',
      isAuthError: false,
    };
  }

  return {
    message: `Image generation failed: ${error instanceof Error ? error.message : String(error)}`,
    isAuthError: false,
  };
}

/**
 * Main entry point for image generation. Generates one or more images
 * sequentially, saving each to disk. Supports partial success for batches.
 */
export async function generateImages(
  options: GenerateImageOptions,
): Promise<ImageGenerationResult> {
  const { config, params, cwd, signal, updateOutput } = options;
  const count = Math.min(Math.max(params.count || 1, 1), 4);
  const modelName =
    params.model || process.env['GEMINI_IMAGE_MODEL'] || DEFAULT_IMAGE_MODEL;
  const outputDir = path.resolve(cwd, params.output_path || DEFAULT_OUTPUT_DIR);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let inputImageBase64: string | undefined;
  let inputImageMimeType: string | undefined;
  const isEditing = !!params.input_image;

  if (params.input_image) {
    const resolvedInput = path.isAbsolute(params.input_image)
      ? params.input_image
      : path.resolve(cwd, params.input_image);
    const imageBuffer = await fs.promises.readFile(resolvedInput);
    inputImageBase64 = imageBuffer.toString('base64');
    inputImageMimeType = getSpecificMimeType(resolvedInput) || 'image/png';
  }

  const baseName = params.filename
    ? params.filename.replace(/\.[^.]+$/, '')
    : promptToFilename(params.prompt);

  const ai = createImageGenClient(config);
  const generatedFiles: string[] = [];
  const errors: string[] = [];
  let firstImageBase64: string | undefined;
  let firstImageMimeType = 'image/png';

  for (let i = 0; i < count; i++) {
    if (signal.aborted) {
      if (generatedFiles.length > 0) {
        errors.push('User cancelled. Returning partial results.');
      }
      break;
    }

    if (count > 1) {
      updateOutput?.(`Generating image ${i + 1} of ${count}...`);
    }

    try {
      const result = await callImageApi({
        ai,
        modelName,
        prompt: params.prompt,
        inputImageBase64,
        inputImageMimeType,
        aspectRatio:
          isEditing && !params.aspect_ratio
            ? undefined
            : params.aspect_ratio || '1:1',
        size: params.size || '1K',
        isEditing,
      });

      if (signal.aborted) {
        if (generatedFiles.length > 0) {
          errors.push('User cancelled. Returning partial results.');
        }
        break;
      }

      if (!result) {
        errors.push(`Variation ${i + 1}: No image data in API response.`);
        continue;
      }

      const extension = mimeToExtension(result.mimeType);
      const filename = getUniqueFilename(
        outputDir,
        baseName,
        extension,
        count > 1 ? i : undefined,
      );
      const fullPath = path.join(outputDir, filename);

      const buffer = Buffer.from(result.base64Data, 'base64');
      await fs.promises.writeFile(fullPath, buffer);

      generatedFiles.push(fullPath);

      if (i === 0 && params.return_to_context) {
        firstImageBase64 = result.base64Data;
        firstImageMimeType = result.mimeType;
      }

      if (count > 1) {
        updateOutput?.(`Generated image ${i + 1} of ${count}: ${fullPath}`);
      }
    } catch (error: unknown) {
      const classified = classifyApiError(error);
      errors.push(`Variation ${i + 1}: ${classified.message}`);

      if (classified.isAuthError) {
        return {
          success: false,
          filePaths: generatedFiles,
          mimeType: firstImageMimeType,
          errors,
        };
      }
    }
  }

  return {
    success: generatedFiles.length > 0,
    filePaths: generatedFiles,
    mimeType: firstImageMimeType,
    base64Data: firstImageBase64,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ─── Tool Schema ─────────────────────────────────────────────────────────────

const GENERATE_IMAGE_DESCRIPTION =
  'Generates images from text prompts or edits existing images using Nano Banana image generation models. When an input_image path is provided, the prompt describes the desired edits to that image. Supports generating multiple variations.';

const GENERATE_IMAGE_SCHEMA = {
  type: 'object' as const,
  properties: {
    prompt: {
      type: 'string' as const,
      description:
        'A detailed text description of the image to generate, or editing instructions when used with input_image. Be specific about style, composition, colors, lighting, and subject matter.',
    },
    input_image: {
      type: 'string' as const,
      description:
        'Optional. Absolute path to an existing image file to edit or transform. When provided, the prompt describes the desired edits. Supports PNG, JPEG, and WebP formats.',
    },
    output_path: {
      type: 'string' as const,
      description:
        "Optional. Directory path (relative to cwd) where the generated image should be saved. Must be within the current working directory. Defaults to './generated-images/'.",
    },
    filename: {
      type: 'string' as const,
      description:
        'Optional. Custom filename for the output image (without extension). If not provided, a filename is auto-generated from the prompt.',
    },
    count: {
      type: 'integer' as const,
      description:
        'Number of image variations to generate (1-4). Defaults to 1.',
      minimum: 1,
      maximum: 4,
      default: 1,
    },
    return_to_context: {
      type: 'boolean' as const,
      description:
        'Optional. If true, the generated image is returned as inlineData in the tool result so the model can see and iterate on it. Use this when the user wants to refine or iterate on the generated image. Defaults to false.',
      default: false,
    },
    aspect_ratio: {
      type: 'string' as const,
      description:
        "Optional. Aspect ratio of the generated image. Defaults to '1:1' for text-to-image. For image editing, defaults to the input image's original aspect ratio.",
      enum: [
        '1:1',
        '16:9',
        '9:16',
        '3:2',
        '2:3',
        '4:3',
        '3:4',
        '4:5',
        '5:4',
        '21:9',
        '4:1',
        '1:4',
        '8:1',
        '1:8',
      ],
      default: '1:1',
    },
    size: {
      type: 'string' as const,
      description:
        "Optional. Output resolution tier. '1K' is ~1024px on the long edge. Defaults to '1K'.",
      enum: ['512px', '1K', '2K', '4K'],
      default: '1K',
    },
    model: {
      type: 'string' as const,
      description:
        "Optional. Override the image generation model. Defaults to 'gemini-3.1-flash-image-preview'.",
      enum: [
        'gemini-3.1-flash-image-preview',
        'gemini-3-pro-image-preview',
        'gemini-2.5-flash-image',
      ],
    },
  },
  required: ['prompt'] as const,
};

// ─── Tool Invocation ─────────────────────────────────────────────────────────

class GenerateImageInvocation extends BaseToolInvocation<
  GenerateImageParams,
  ToolResult
> {
  constructor(
    params: GenerateImageParams,
    private readonly config: Config,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    const truncatedPrompt =
      this.params.prompt.length > 80
        ? this.params.prompt.substring(0, 80) + '...'
        : this.params.prompt;
    const mode = this.params.input_image ? 'Edit image' : 'Generate image';
    const model = this.params.model || DEFAULT_IMAGE_MODEL;
    const outputDir = this.params.output_path || `./${DEFAULT_OUTPUT_DIR}/`;
    const count = this.params.count || 1;

    const lines = [`${mode}: "${truncatedPrompt}"`];
    if (this.params.input_image) {
      lines.push(`  Source:  ${this.params.input_image}`);
    }
    lines.push(`  Output:  ${outputDir}`);
    lines.push(`  Model:   ${model}`);
    if (count > 1) {
      lines.push(`  Count:   ${count}`);
    }
    if (!this.params.input_image) {
      lines.push(`  Ratio: ${this.params.aspect_ratio || '1:1'}`);
    } else if (this.params.aspect_ratio) {
      lines.push(`  Ratio: ${this.params.aspect_ratio}`);
    }
    if (this.params.size) {
      lines.push(`  Size:    ${this.params.size}`);
    }
    return lines.join('\n');
  }

  override toolLocations(): ToolLocation[] {
    return [
      {
        path: path.resolve(
          this.config.getTargetDir(),
          this.params.output_path || 'generated-images',
        ),
      },
    ];
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string | AnsiOutput) => void,
  ): Promise<ToolResult> {
    if (signal.aborted) {
      return {
        llmContent: 'Image generation cancelled.',
        returnDisplay: 'Cancelled.',
      };
    }

    const cwd = this.config.getTargetDir();

    // Validate input image if provided
    if (this.params.input_image) {
      const inputError = validateInputImage(this.params.input_image, cwd);
      if (inputError) {
        return {
          llmContent: inputError,
          returnDisplay: inputError,
        };
      }
    }

    // Validate output path
    if (this.params.output_path) {
      const outputError = validateOutputPath(this.params.output_path, cwd);
      if (outputError) {
        return {
          llmContent: outputError,
          returnDisplay: outputError,
        };
      }
    }

    const result = await generateImages({
      config: this.config,
      params: this.params,
      cwd,
      signal,
      updateOutput: updateOutput
        ? (msg: string) => updateOutput(msg)
        : undefined,
    });

    if (!result.success) {
      const errorMsg = result.errors?.join('\n') || 'Image generation failed.';
      return {
        llmContent: errorMsg,
        returnDisplay: errorMsg,
      };
    }

    const count = result.filePaths.length;
    const fileList = result.filePaths.map((p) => `- ${p}`).join('\n');
    const warningText = result.errors
      ? '\n\nWarnings:\n' + result.errors.join('\n')
      : '';

    if (this.params.return_to_context && result.base64Data) {
      return {
        llmContent: [
          {
            text: `Successfully generated ${count} image(s):\n${fileList}${warningText}\n\nThe first image is included below for review.`,
          },
          {
            inlineData: {
              data: result.base64Data,
              mimeType: result.mimeType,
            },
          },
        ],
        returnDisplay:
          `Generated ${count} image(s):\n` +
          result.filePaths.map((p) => `  ${p}`).join('\n'),
      };
    }

    return {
      llmContent: `Successfully generated ${count} image(s):\n${fileList}${warningText}\n\nThe images have been saved to disk. You can reference these file paths in subsequent operations.`,
      returnDisplay:
        `Generated ${count} image(s):\n` +
        result.filePaths.map((p) => `  ${p}`).join('\n'),
    };
  }
}

// ─── Tool Builder ────────────────────────────────────────────────────────────

/**
 * Built-in tool for generating and editing images using Nano Banana models.
 * Gated behind the `imageGeneration` setting and requires Gemini API key
 * or Vertex AI authentication.
 */
export class GenerateImageTool extends BaseDeclarativeTool<
  GenerateImageParams,
  ToolResult
> {
  static readonly Name = GENERATE_IMAGE_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      GenerateImageTool.Name,
      GENERATE_IMAGE_DISPLAY_NAME,
      GENERATE_IMAGE_DESCRIPTION,
      Kind.Execute,
      GENERATE_IMAGE_SCHEMA,
      messageBus,
      true, // isOutputMarkdown
      true, // canUpdateOutput (for batch streaming)
    );
  }

  protected override validateToolParamValues(
    params: GenerateImageParams,
  ): string | null {
    if (!params.prompt || params.prompt.trim() === '') {
      return "The 'prompt' parameter cannot be empty.";
    }

    if (params.count !== undefined) {
      if (params.count < 1 || params.count > 4) {
        return "The 'count' parameter must be between 1 and 4.";
      }
    }

    if (params.output_path) {
      const error = validateOutputPath(
        params.output_path,
        this.config.getTargetDir(),
      );
      if (error) return error;
    }

    return null;
  }

  protected createInvocation(
    params: GenerateImageParams,
    messageBus: MessageBus,
    toolName?: string,
    toolDisplayName?: string,
  ): ToolInvocation<GenerateImageParams, ToolResult> {
    return new GenerateImageInvocation(
      params,
      this.config,
      messageBus ?? this.messageBus,
      toolName,
      toolDisplayName,
    );
  }
}
