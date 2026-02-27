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

// Bytes per second for common audio codecs (used for duration estimation).
// These are conservative averages; actual bitrates vary with encoding settings.
const AUDIO_BYTES_PER_SECOND: Record<string, number> = {
  'audio/mp3': 16000, // ~128 kbps
  'audio/mpeg': 16000, // ~128 kbps
  'audio/wav': 176400, // 44.1 kHz, 16-bit, stereo (uncompressed)
  'audio/ogg': 16000, // ~128 kbps Vorbis
  'audio/aac': 16000, // ~128 kbps
  'audio/flac': 88200, // ~50% of WAV (lossless)
  'audio/webm': 16000, // ~128 kbps Opus
  'audio/opus': 8000, // ~64 kbps (Opus is very efficient)
};

// Average bytes per second for common video containers.
// Assumes typical web video bitrates (~2-4 Mbps video + audio).
const VIDEO_BYTES_PER_SECOND: Record<string, number> = {
  'video/mp4': 375000, // ~3 Mbps
  'video/webm': 312500, // ~2.5 Mbps
  'video/ogg': 312500, // ~2.5 Mbps
  'video/quicktime': 375000, // ~3 Mbps
  'video/x-msvideo': 375000, // ~3 Mbps (AVI)
};

/**
 * Computes the raw byte size from a base64-encoded string.
 * Accounts for padding characters ('=') that don't contribute to data.
 */
export function base64ByteSize(base64: string): number {
  let padding = 0;
  if (base64.endsWith('==')) {
    padding = 2;
  } else if (base64.endsWith('=')) {
    padding = 1;
  }
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Formats a byte count as a human-readable string (e.g., "1.5 KB", "3.2 MB").
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formats a duration in seconds as a human-readable string.
 * Uses "Xm Ys" for durations >= 60s, otherwise "Xs".
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remaining = totalSeconds % 60;
  return `${minutes}m ${remaining}s`;
}

/**
 * Classifies a MIME type into a media category.
 */
function classifyMimeType(
  mimeType: string,
): 'audio' | 'video' | 'image' | 'pdf' | 'other' {
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'other';
}

/**
 * Builds a verbose description for an inlineData part.
 *
 * For audio:  `[Audio: audio/mp3, 45.2 KB, ~3.0s]`
 * For video:  `[Video: video/mp4, 1.2 MB, ~3.2s]`
 * For images: `[Image: image/png, 120.5 KB]`
 * For PDFs:   `[PDF: 2.3 MB]`
 * For other:  `[Data: application/octet-stream, 512 B]`
 *
 * Falls back gracefully when data or mimeType is missing.
 */
export function describeInlineData(
  mimeType: string | undefined,
  data: string | undefined,
): string {
  const effectiveMime = mimeType ?? 'unknown';
  const category = classifyMimeType(effectiveMime);

  const parts: string[] = [];

  // Label based on category
  switch (category) {
    case 'audio':
      parts.push(`Audio: ${effectiveMime}`);
      break;
    case 'video':
      parts.push(`Video: ${effectiveMime}`);
      break;
    case 'image':
      parts.push(`Image: ${effectiveMime}`);
      break;
    case 'pdf':
      parts.push('PDF');
      break;
    default:
      parts.push(`Data: ${effectiveMime}`);
      break;
  }

  // Size info from base64 data
  if (data && data.length > 0) {
    const byteSize = base64ByteSize(data);
    parts.push(formatBytes(byteSize));

    // Duration estimate for audio/video
    if (category === 'audio') {
      const bytesPerSec = AUDIO_BYTES_PER_SECOND[effectiveMime];
      if (bytesPerSec !== undefined && byteSize > 0) {
        parts.push(`~${formatDuration(byteSize / bytesPerSec)}`);
      }
    } else if (category === 'video') {
      const bytesPerSec = VIDEO_BYTES_PER_SECOND[effectiveMime];
      if (bytesPerSec !== undefined && byteSize > 0) {
        parts.push(`~${formatDuration(byteSize / bytesPerSec)}`);
      }
    }
  }

  return `[${parts.join(', ')}]`;
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
      return `[Video Metadata]`;
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
      return `[File Data]`;
    }
    if (part.functionCall !== undefined) {
      return `[Function Call: ${part.functionCall.name}]`;
    }
    if (part.functionResponse !== undefined) {
      return `[Function Response: ${part.functionResponse.name}]`;
    }
    if (part.inlineData !== undefined) {
      return describeInlineData(part.inlineData.mimeType, part.inlineData.data);
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
