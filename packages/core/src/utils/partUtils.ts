/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentResponse,
  PartListUnion,
  Part,
  PartUnion,
} from '@google/genai';

/**
 * Approximate bitrates (kbps) used for duration estimation of audio/video.
 * These are typical values for common web/streaming codecs.
 */
const AUDIO_BITRATES_KBPS: Record<string, number> = {
  'audio/mp3': 128,
  'audio/mpeg': 128,
  'audio/mp4': 128,
  'audio/aac': 128,
  'audio/ogg': 128,
  'audio/webm': 64,
  // Uncompressed PCM — 16-bit, 44.1 kHz, stereo ≈ 1411 kbps
  'audio/wav': 1411,
  'audio/pcm': 1411,
  'audio/l16': 1411,
};
const DEFAULT_AUDIO_BITRATE_KBPS = 128;

const VIDEO_BITRATES_KBPS: Record<string, number> = {
  'video/mp4': 2500,
  'video/webm': 1000,
};
const DEFAULT_VIDEO_BITRATE_KBPS = 2000;

/**
 * Maps a MIME type to a human-readable media category label.
 */
function getMimeCategory(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith('audio/')) return 'Audio';
  if (lower.startsWith('video/')) return 'Video';
  if (lower.startsWith('image/')) return 'Image';
  if (lower === 'application/pdf') return 'Document';
  if (lower.startsWith('text/')) return 'Text';
  return 'Binary';
}

/**
 * Estimates the byte size from a base64-encoded string and returns it in KB.
 */
function base64ToKB(data: string): number {
  // Base64 encodes 3 bytes per 4 chars; strip padding chars before computing.
  const padding = (data.match(/=+$/) ?? [''])[0].length;
  return (data.length * 0.75 - padding) / 1024;
}

/**
 * Estimates playback duration (seconds) from byte size and codec bitrate.
 */
function estimateDuration(sizeKB: number, mimeType: string): number {
  const lower = mimeType.toLowerCase();
  let bitrateKbps: number;
  if (lower.startsWith('audio/')) {
    bitrateKbps = AUDIO_BITRATES_KBPS[lower] ?? DEFAULT_AUDIO_BITRATE_KBPS;
  } else {
    bitrateKbps = VIDEO_BITRATES_KBPS[lower] ?? DEFAULT_VIDEO_BITRATE_KBPS;
  }
  // size(KB) × 8 / bitrate(kbps) = seconds
  return (sizeKB * 8) / bitrateKbps;
}

/**
 * Formats a duration in seconds as M:SS (e.g. 1:23).
 */
function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Formats an inlineData part for verbose display.
 * Examples:
 *   [Audio: audio/mp3, 45.2 KB, ~3.0s]
 *   [Video: video/mp4, 1024.0 KB, ~3.3s]
 *   [Image: image/png, 12.3 KB]
 *   [Document: application/pdf, 256.0 KB]
 *   [Text: text/plain, 1.2 KB]
 *   [Binary: application/octet-stream, 8.0 KB]
 *   [Audio: audio/mp3]  (when data is empty/missing)
 */
function formatInlineData(inlineData: {
  mimeType?: string;
  data?: string;
}): string {
  const mimeType = inlineData.mimeType ?? 'application/octet-stream';
  const category = getMimeCategory(mimeType);

  if (!inlineData.data) {
    return `[${category}: ${mimeType}]`;
  }

  const sizeKB = base64ToKB(inlineData.data);
  const sizeStr = `${sizeKB.toFixed(1)} KB`;

  const lower = mimeType.toLowerCase();
  const isAV = lower.startsWith('audio/') || lower.startsWith('video/');

  if (isAV) {
    const durationS = estimateDuration(sizeKB, mimeType);
    return `[${category}: ${mimeType}, ${sizeStr}, ~${durationS.toFixed(1)}s]`;
  }

  return `[${category}: ${mimeType}, ${sizeStr}]`;
}

/**
 * Formats a fileData part for verbose display.
 * Example: [File: gs://bucket/file.mp4, video/mp4]
 */
function formatFileData(fileData: {
  fileUri?: string;
  mimeType?: string;
}): string {
  const uri = fileData.fileUri;
  const mime = fileData.mimeType;
  if (uri && mime) return `[File: ${uri}, ${mime}]`;
  if (uri) return `[File: ${uri}]`;
  if (mime) return `[File: ${mime}]`;
  return `[File Data]`;
}

/**
 * Formats a videoMetadata part for verbose display.
 * Example: [Video Metadata: 0:00–1:23]  or  [Video Metadata]
 */
function formatVideoMetadata(videoMetadata: unknown): string {
  if (videoMetadata && typeof videoMetadata === 'object') {
    const rawStart =
      'startOffset' in videoMetadata ? videoMetadata.startOffset : undefined;
    const rawEnd =
      'endOffset' in videoMetadata ? videoMetadata.endOffset : undefined;
    const start =
      typeof rawStart === 'number'
        ? rawStart
        : typeof rawStart === 'string'
          ? parseFloat(rawStart)
          : NaN;
    const end =
      typeof rawEnd === 'number'
        ? rawEnd
        : typeof rawEnd === 'string'
          ? parseFloat(rawEnd)
          : NaN;
    if (!isNaN(start) && !isNaN(end)) {
      return `[Video Metadata: ${formatSeconds(start)}–${formatSeconds(end)}]`;
    }
  }
  return `[Video Metadata]`;
}

/**
 * Converts a PartListUnion into a string.
 * If verbose is true, includes summary representations of non-text parts.
 */
export function partToString(
  value: PartListUnion,
  options?: { verbose?: boolean },
): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((part) => partToString(part, options)).join('');
  }

  // Cast to Part, assuming it might contain project-specific fields
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const part = value as Part & {
    videoMetadata?: unknown;
    thought?: string;
    codeExecutionResult?: unknown;
    executableCode?: unknown;
  };

  if (options?.verbose) {
    if (part.videoMetadata !== undefined) {
      return formatVideoMetadata(part.videoMetadata);
    }
    if (part.thought !== undefined) {
      return `[Thought: ${part.thought}]`;
    }
    if (part.codeExecutionResult !== undefined) {
      return `[Code Execution Result]`;
    }
    if (part.executableCode !== undefined) {
      return `[Executable Code]`;
    }

    // Standard Part fields
    if (part.fileData !== undefined) {
      return formatFileData(part.fileData);
    }
    if (part.functionCall !== undefined) {
      return `[Function Call: ${part.functionCall.name}]`;
    }
    if (part.functionResponse !== undefined) {
      return `[Function Response: ${part.functionResponse.name}]`;
    }
    if (part.inlineData !== undefined) {
      return formatInlineData(part.inlineData);
    }
  }

  return part.text ?? '';
}

export function getResponseText(
  response: GenerateContentResponse,
): string | null {
  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];

    if (
      candidate.content &&
      candidate.content.parts &&
      candidate.content.parts.length > 0
    ) {
      return candidate.content.parts
        .filter((part) => part.text && !part.thought)
        .map((part) => part.text)
        .join('');
    }
  }
  return null;
}

/**
 * Asynchronously maps over a PartListUnion, applying a transformation function
 * to the text content of each text-based part.
 *
 * @param parts The PartListUnion to process.
 * @param transform A function that takes a string of text and returns a Promise
 *   resolving to an array of new PartUnions.
 * @returns A Promise that resolves to a new array of PartUnions with the
 *   transformations applied.
 */
export async function flatMapTextParts(
  parts: PartListUnion,
  transform: (text: string) => Promise<PartUnion[]>,
): Promise<PartUnion[]> {
  const result: PartUnion[] = [];
  const partArray = Array.isArray(parts)
    ? parts
    : typeof parts === 'string'
      ? [{ text: parts }]
      : [parts];

  for (const part of partArray) {
    let textToProcess: string | undefined;
    if (typeof part === 'string') {
      textToProcess = part;
    } else if ('text' in part) {
      textToProcess = part.text;
    }

    if (textToProcess !== undefined) {
      const transformedParts = await transform(textToProcess);
      result.push(...transformedParts);
    } else {
      // Pass through non-text parts unmodified.
      result.push(part);
    }
  }
  return result;
}

/**
 * Appends a string of text to the last text part of a prompt, or adds a new
 * text part if the last part is not a text part.
 *
 * @param prompt The prompt to modify.
 * @param textToAppend The text to append to the prompt.
 * @param separator The separator to add between existing text and the new text.
 * @returns The modified prompt.
 */
export function appendToLastTextPart(
  prompt: PartUnion[],
  textToAppend: string,
  separator = '\n\n',
): PartUnion[] {
  if (!textToAppend) {
    return prompt;
  }

  if (prompt.length === 0) {
    return [{ text: textToAppend }];
  }

  const newPrompt = [...prompt];
  const lastPart = newPrompt.at(-1);

  if (typeof lastPart === 'string') {
    newPrompt[newPrompt.length - 1] = `${lastPart}${separator}${textToAppend}`;
  } else if (lastPart && 'text' in lastPart) {
    newPrompt[newPrompt.length - 1] = {
      ...lastPart,
      text: `${lastPart.text}${separator}${textToAppend}`,
    };
  } else {
    newPrompt.push({ text: `${separator}${textToAppend}` });
  }

  return newPrompt;
}
