/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { SHOW_IMAGE_TOOL_NAME } from './tool-names.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import { getErrorMessage, isAbortError } from '../utils/errors.js';
import { debugLogger } from '../utils/debugLogger.js';
import { SHOW_IMAGE_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';

const IMAGE_FETCH_TIMEOUT_MS = 15000;
const MAX_IMAGE_SIZE = 1400;

/**
 * Parameters for the ShowImage tool
 */
export interface ShowImageToolParams {
  query: string;
  url?: string;
}

/**
 * Check if a string looks like a local file path.
 */
function isLocalFilePath(str: string): boolean {
  return (
    str.startsWith('/') ||
    str.startsWith('~') ||
    str.startsWith('./') ||
    str.startsWith('../') ||
    /^[a-zA-Z]:\\/.test(str)
  );
}

/**
 * Resolve a file path, expanding ~ to home directory.
 */
function resolveFilePath(filePath: string): string {
  if (filePath.startsWith('~')) {
    const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
    return path.join(home, filePath.slice(1));
  }
  return path.resolve(filePath);
}

/**
 * Render an image inline using iTerm2's native Inline Image Protocol.
 * https://iterm2.com/documentation-images.html
 *
 * We write the escape sequence to a temp file and cat it through
 * a child process with stdio: 'inherit'. This bypasses Ink's
 * patched process.stdout because execSync inherits the raw
 * terminal file descriptor, not Ink's intercepted write method.
/**
 * Render an image inline using iTerm2's native Inline Image Protocol.
 * https://iterm2.com/documentation-images.html
 *
 * We write the escape sequence to a temp file and cat it through
 * a child process with stdio: 'inherit'. This bypasses Ink's
 * patched process.stdout because execSync inherits the raw
 * terminal file descriptor, not Ink's intercepted write method.
 */
function renderImageInTerminal(imageBuffer: Buffer): void {
  const base64Data = imageBuffer.toString('base64');
  const args = [
    'inline=1',
    'width=auto',
    'height=auto',
    'preserveAspectRatio=1',
    `size=${imageBuffer.length}`,
  ].join(';');

  // iTerm2 natively advances the cursor past the rendered image.
  // We only append a tiny 3-line buffer to absorb Ink's cursor redraw.
  // Ink typically moves UP 2-3 lines to redraw its status frame. By adding
  // 3 lines, Ink's redraw lands safely under the image.
  const bottomBuffer = '\n'.repeat(3);
  const sequence = `\n\x1b]1337;File=${args}:${base64Data}\x07${bottomBuffer}`;

  // Write to a temp file then cat it — execSync with stdio:'inherit'
  // uses the raw terminal fd, bypassing Ink's stdout patching.
  const tmpFile = path.join(
    process.env['TMPDIR'] || '/tmp',
    `gemini-cli-image-${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(tmpFile, sequence);
    execSync(`cat "${tmpFile}"`, { stdio: 'inherit' });
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

class ShowImageToolInvocation extends BaseToolInvocation<
  ShowImageToolParams,
  ToolResult
> {
  constructor(
    params: ShowImageToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  override getDescription(): string {
    if (this.params.url) {
      if (isLocalFilePath(this.params.url)) {
        return `Displaying local image: ${this.params.url}`;
      }
      return `Fetching and displaying image from: ${this.params.url}`;
    }
    if (isLocalFilePath(this.params.query)) {
      return `Displaying local image: ${this.params.query}`;
    }
    return `Searching for and displaying image: "${this.params.query}"`;
  }

  /**
   * Load image buffer from either a local file or a URL.
   */
  private async loadImageBuffer(
    signal: AbortSignal,
  ): Promise<{ buffer: Buffer; source: string } | ToolResult> {
    const possiblePath = this.params.url || this.params.query;

    if (isLocalFilePath(possiblePath)) {
      const resolvedPath = resolveFilePath(possiblePath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          llmContent: `File not found: ${resolvedPath}`,
          returnDisplay: 'Error: file not found',
          error: {
            message: `File not found: ${resolvedPath}`,
            type: ToolErrorType.UNKNOWN,
          },
        };
      }

      try {
        const buffer = fs.readFileSync(resolvedPath);
        return { buffer, source: `Local file: ${resolvedPath}` };
      } catch (readError: unknown) {
        return {
          llmContent: `Error reading file ${resolvedPath}: ${getErrorMessage(readError)}`,
          returnDisplay: 'Error reading image file',
          error: {
            message: getErrorMessage(readError),
            type: ToolErrorType.UNKNOWN,
          },
        };
      }
    }

    // It's a URL or search query
    let imageUrl: string;
    if (
      this.params.url &&
      (this.params.url.startsWith('http://') ||
        this.params.url.startsWith('https://'))
    ) {
      imageUrl = this.params.url;
    } else {
      const query = encodeURIComponent(this.params.query);
      imageUrl = `https://source.unsplash.com/featured/?${query}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      IMAGE_FETCH_TIMEOUT_MS,
    );
    signal.addEventListener('abort', () => controller.abort());

    let response: Response;
    try {
      response = await fetch(imageUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; GeminiCLI/1.0; +https://github.com/google-gemini/gemini-cli)',
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return {
        llmContent: `Failed to fetch image from ${imageUrl}: HTTP ${response.status} ${response.statusText}`,
        returnDisplay: `Error fetching image (HTTP ${response.status})`,
        error: {
          message: `HTTP ${response.status} ${response.statusText}`,
          type: ToolErrorType.UNKNOWN,
        },
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), source: `URL: ${imageUrl}` };
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      const loadResult = await this.loadImageBuffer(signal);

      if ('llmContent' in loadResult) {
        return loadResult;
      }

      const { buffer: imageBuffer, source: sourceInfo } = loadResult;

      // Get image dimensions and resize if too large
      let dimensions = '';
      let finalBuffer = imageBuffer;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sharpModule: any = await import('sharp');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const sharpFn = sharpModule.default ?? sharpModule;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const image = sharpFn(imageBuffer);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const metadata = await image.metadata();

        if (metadata.width && metadata.height) {
          dimensions = ` (${metadata.width}×${metadata.height}px)`;

          // Resize if width or height is larger than max size
          if (metadata.width && metadata.height) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const resizedImage = image.resize({
              width: MAX_IMAGE_SIZE,
              height: MAX_IMAGE_SIZE,
              fit: 'inside', // keeps aspect ratio and fits inside the box
              withoutEnlargement: true, // prevents upscaling
            });

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            finalBuffer = await resizedImage.toBuffer();

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const resizedMeta = await sharpFn(finalBuffer).metadata();

            if (resizedMeta.width && resizedMeta.height) {
              dimensions = ` (${resizedMeta.width}×${resizedMeta.height}px, max ${MAX_IMAGE_SIZE}×${MAX_IMAGE_SIZE})`;
            }
          }
        }
      } catch {
        // sharp not available, use original buffer
      }

      // Render inline using iTerm2's native protocol
      renderImageInTerminal(finalBuffer);

      return {
        llmContent: `Successfully displayed image inline in the terminal${dimensions}. ${sourceInfo}`,
        returnDisplay: `Image displayed${dimensions}`,
      };
    } catch (error: unknown) {
      if (isAbortError(error)) {
        return {
          llmContent: 'Image display was cancelled.',
          returnDisplay: 'Image display cancelled.',
        };
      }
      const errorMessage = `Error displaying image for "${this.params.query}": ${getErrorMessage(error)}`;
      debugLogger.warn(errorMessage, error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: 'Error displaying image.',
        error: {
          message: errorMessage,
          type: ToolErrorType.UNKNOWN,
        },
      };
    }
  }
}

/**
 * A tool to fetch images from the internet or display local images
 * inline in the terminal using iTerm2's Inline Image Protocol.
 */
export class ShowImageTool extends BaseDeclarativeTool<
  ShowImageToolParams,
  ToolResult
> {
  static readonly Name = SHOW_IMAGE_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      ShowImageTool.Name,
      'ShowImage',
      SHOW_IMAGE_DEFINITION.base.description!,
      Kind.Search,
      SHOW_IMAGE_DEFINITION.base.parametersJsonSchema,
      messageBus,
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected override validateToolParamValues(
    params: ShowImageToolParams,
  ): string | null {
    if (!params.query || params.query.trim() === '') {
      return "The 'query' parameter cannot be empty.";
    }
    return null;
  }

  protected createInvocation(
    params: ShowImageToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<ShowImageToolParams, ToolResult> {
    return new ShowImageToolInvocation(
      params,
      messageBus ?? this.messageBus,
      _toolName,
      _toolDisplayName,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(SHOW_IMAGE_DEFINITION, modelId);
  }
}
