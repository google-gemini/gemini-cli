/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextAccountingState, ContextProcessor } from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import { sanitizeFilenamePart } from '../../utils/fileUtils.js';
import type { EpisodeEditor } from '../ir/episodeEditor.js';

export type BlobDegradationProcessorOptions = Record<string, never>;

export class BlobDegradationProcessor implements ContextProcessor {
  static create(
    env: ContextEnvironment,
    _options: BlobDegradationProcessorOptions,
  ): BlobDegradationProcessor {
    return new BlobDegradationProcessor(env);
  }

  readonly id = 'BlobDegradationProcessor';
  readonly name = 'BlobDegradationProcessor';
  readonly options = {};
  private env: ContextEnvironment;

  constructor(env: ContextEnvironment) {
    this.env = env;
  }

  async process(
    editor: EpisodeEditor,
    state: ContextAccountingState,
  ): Promise<void> {
    if (state.isBudgetSatisfied) {
      return;
    }

    let currentDeficit = state.deficitTokens;
    let directoryCreated = false;

    let blobOutputsDir = this.env.fileSystem.join(
      this.env.projectTempDir,
      'degraded-blobs',
    );
    const sessionId = this.env.sessionId;
    if (sessionId) {
      blobOutputsDir = this.env.fileSystem.join(
        blobOutputsDir,
        `session-${sanitizeFilenamePart(sessionId)}`,
      );
    }

    const ensureDir = async () => {
      if (!directoryCreated) {
        await this.env.fileSystem.mkdir(blobOutputsDir, { recursive: true });
        directoryCreated = true;
      }
    };

    // Forward scan, looking for bloated non-text parts to degrade
    for (const ep of editor.episodes) {
      if (currentDeficit <= 0) break;
      if (state.protectedEpisodeIds.has(ep.id)) continue;

      if (ep.trigger.type === 'USER_PROMPT') {
        for (let j = 0; j < ep.trigger.semanticParts.length; j++) {
          const part = ep.trigger.semanticParts[j];
          if (currentDeficit <= 0) break;
          // We only target non-text parts that haven't already been masked
          if (part.type === 'text' || part.presentation) continue;

          let newText = '';
          let tokensSaved = 0;

          if (part.type === 'inline_data') {
            await ensureDir();
            const ext = part.mimeType.split('/')[1] || 'bin';
            const fileName = `blob_${Date.now()}_${this.env.idGenerator.generateId()}.${ext}`;
            const filePath = this.env.fileSystem.join(blobOutputsDir, fileName);

            // Base64 to buffer
            const buffer = Buffer.from(part.data, 'base64');
            await this.env.fileSystem.writeFile(filePath, buffer);

            const mb = (buffer.byteLength / 1024 / 1024).toFixed(2);
            newText = `[Multi-Modal Blob (${part.mimeType}, ${mb}MB) degraded to text to preserve context window. Saved to: ${filePath}]`;

            // Re-calculate tokens. Images are expensive (~258 tokens). The text is cheap (~20 tokens).
            const oldTokens = this.env.tokenCalculator.estimateTokensForParts([
              { inlineData: { mimeType: part.mimeType, data: part.data } },
            ]);
            const newTokens = this.env.tokenCalculator.estimateTokensForParts([
              { text: newText },
            ]);
            tokensSaved = oldTokens - newTokens;
          } else if (part.type === 'file_data') {
            newText = `[File Reference (${part.mimeType}) degraded to text to preserve context window. Original URI: ${part.fileUri}]`;
            const oldTokens = this.env.tokenCalculator.estimateTokensForParts([
              { fileData: { mimeType: part.mimeType, fileUri: part.fileUri } },
            ]);
            const newTokens = this.env.tokenCalculator.estimateTokensForParts([
              { text: newText },
            ]);
            tokensSaved = oldTokens - newTokens;
          } else if (part.type === 'raw_part') {
            newText = `[Unknown Part degraded to text to preserve context window.]`;
            const oldTokens = this.env.tokenCalculator.estimateTokensForParts([
              part.part,
            ]);
            const newTokens = this.env.tokenCalculator.estimateTokensForParts([
              { text: newText },
            ]);
            tokensSaved = oldTokens - newTokens;
          }

          if (newText && tokensSaved > 0) {
            const newTokens = this.env.tokenCalculator.estimateTokensForParts([
              { text: newText },
            ]);

            editor.editEpisode(ep.id, 'DEGRADE_BLOB', (draft) => {
              if (draft.trigger.type === 'USER_PROMPT') {
                draft.trigger.semanticParts[j].presentation = {
                  text: newText,
                  tokens: newTokens,
                };
                draft.trigger.metadata.transformations.push({
                  processorName: this.name,
                  action: 'DEGRADED',
                  timestamp: Date.now(),
                });
              }
            });

            currentDeficit -= tokensSaved;
          }
        }
      }
    }
  }
}
