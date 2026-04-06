/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Episode } from '../ir/types.js';
import type { ContextAccountingState, ContextProcessor } from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';

import { sanitizeFilenamePart } from '../../utils/fileUtils.js';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { Part } from '@google/genai';

export class BlobDegradationProcessor implements ContextProcessor {
  readonly name = 'BlobDegradation';
  private env: ContextEnvironment;

  constructor(env: ContextEnvironment, options: Record<string, unknown> = {}) {
    this.env = env;
  }

  async process(
    episodes: Episode[],
    state: ContextAccountingState,
  ): Promise<Episode[]> {
    if (state.isBudgetSatisfied) {
      return episodes;
    }

    let currentDeficit = state.deficitTokens;
    const newEpisodes = [...episodes];
    let directoryCreated = false;

    let blobOutputsDir = path.join(
      this.env.projectTempDir,
      'degraded-blobs',
    );
    const sessionId = this.env.sessionId;
    if (sessionId) {
      blobOutputsDir = path.join(
        blobOutputsDir,
        `session-${sanitizeFilenamePart(sessionId)}`,
      );
    }

    const ensureDir = async () => {
      if (!directoryCreated) {
        await fsPromises.mkdir(blobOutputsDir, { recursive: true });
        directoryCreated = true;
      }
    };

    // Forward scan, looking for bloated non-text parts to degrade
    for (let i = 0; i < newEpisodes.length; i++) {
      if (currentDeficit <= 0) break;
      const ep = newEpisodes[i];
      if (state.protectedEpisodeIds.has(ep.id)) continue;

      if (ep.trigger.type === 'USER_PROMPT') {
        for (const part of ep.trigger.semanticParts) {
          if (currentDeficit <= 0) break;
          // We only target non-text parts that haven't already been masked
          if (part.type === 'text' || part.presentation) continue;

          let newText = '';
          let tokensSaved = 0;

          if (part.type === 'inline_data') {
            await ensureDir();
            const ext = part.mimeType.split('/')[1] || 'bin';
            const fileName = `blob_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
            const filePath = path.join(blobOutputsDir, fileName);

            // Base64 to buffer
            const buffer = Buffer.from(part.data, 'base64');
            await fsPromises.writeFile(filePath, buffer);

            const mb = (buffer.byteLength / 1024 / 1024).toFixed(2);
            newText = `[Multi-Modal Blob (${part.mimeType}, ${mb}MB) degraded to text to preserve context window. Saved to: ${filePath}]`;

            // Re-calculate tokens. Images are expensive (~258 tokens). The text is cheap (~20 tokens).
            const oldTokens = this.env.tokenCalculator.estimateTokensForParts([
              { inlineData: { mimeType: part.mimeType, data: part.data } },
            ]);
            const newTokens = this.env.tokenCalculator.estimateTokensForParts([{ text: newText }]);
            tokensSaved = oldTokens - newTokens;
          } else if (part.type === 'file_data') {
            newText = `[File Reference (${part.mimeType}) degraded to text to preserve context window. Original URI: ${part.fileUri}]`;
            const oldTokens = this.env.tokenCalculator.estimateTokensForParts([
              { fileData: { mimeType: part.mimeType, fileUri: part.fileUri } },
            ]);
            const newTokens = this.env.tokenCalculator.estimateTokensForParts([{ text: newText }]);
            tokensSaved = oldTokens - newTokens;
          } else if (part.type === 'raw_part') {
            newText = `[Unknown Part degraded to text to preserve context window.]`;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const oldTokens = this.env.tokenCalculator.estimateTokensForParts([part.part as Part]);
            const newTokens = this.env.tokenCalculator.estimateTokensForParts([{ text: newText }]);
            tokensSaved = oldTokens - newTokens;
          }

          if (newText && tokensSaved > 0) {
            const newTokens = this.env.tokenCalculator.estimateTokensForParts([{ text: newText }]);
            part.presentation = { text: newText, tokens: newTokens };

            ep.trigger.metadata.transformations.push({
              processorName: this.name,
              action: 'DEGRADED',
              timestamp: Date.now(),
            });

            currentDeficit -= tokensSaved;
          }
        }
      }
    }

    return newEpisodes;
  }
}
