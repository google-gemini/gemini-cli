/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ProcessArgs, ContextProcessor } from '../pipeline.js';
import type { ConcreteNode, UserPrompt } from '../ir/types.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import { sanitizeFilenamePart } from '../../utils/fileUtils.js';

export type BlobDegradationProcessorOptions = Record<string, never>;

export class BlobDegradationProcessor implements ContextProcessor {
  static create(
    env: ContextEnvironment,
    _options: BlobDegradationProcessorOptions,
  ): BlobDegradationProcessor {
    return new BlobDegradationProcessor(env);
  }

  readonly componentType = 'processor';
  readonly id = 'BlobDegradationProcessor';
  readonly name = 'BlobDegradationProcessor';
  readonly options = {};
  private env: ContextEnvironment;

  constructor(env: ContextEnvironment) {
    this.env = env;
  }

  async process({ targets }: ProcessArgs): Promise<readonly ConcreteNode[]> {
    if (targets.length === 0) {
      return targets;
    }

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

    const returnedNodes: ConcreteNode[] = [];

    // Forward scan, looking for bloated non-text parts to degrade
    for (const node of targets) {
      switch (node.type) {
        case 'USER_PROMPT': {
          let modified = false;
          const newParts = [...node.semanticParts];

          for (let j = 0; j < node.semanticParts.length; j++) {
            const part = node.semanticParts[j];
            if (part.type === 'text') continue;

            let newText = '';
            let tokensSaved = 0;

            switch (part.type) {
              case 'inline_data': {
                await ensureDir();
                const ext = part.mimeType.split('/')[1] || 'bin';
                const fileName = `blob_${Date.now()}_${this.env.idGenerator.generateId()}.${ext}`;
                const filePath = this.env.fileSystem.join(blobOutputsDir, fileName);

                const buffer = Buffer.from(part.data, 'base64');
                await this.env.fileSystem.writeFile(filePath, buffer);

                const mb = (buffer.byteLength / 1024 / 1024).toFixed(2);
                newText = `[Multi-Modal Blob (${part.mimeType}, ${mb}MB) degraded to text to preserve context window. Saved to: ${filePath}]`;

                const oldTokens = this.env.tokenCalculator.estimateTokensForParts([
                  { inlineData: { mimeType: part.mimeType, data: part.data } },
                ]);
                const newTokens = this.env.tokenCalculator.estimateTokensForParts([
                  { text: newText },
                ]);
                tokensSaved = oldTokens - newTokens;
                break;
              }
              case 'file_data': {
                newText = `[File Reference (${part.mimeType}) degraded to text to preserve context window. Original URI: ${part.fileUri}]`;
                const oldTokens = this.env.tokenCalculator.estimateTokensForParts([
                  { fileData: { mimeType: part.mimeType, fileUri: part.fileUri } },
                ]);
                const newTokens = this.env.tokenCalculator.estimateTokensForParts([
                  { text: newText },
                ]);
                tokensSaved = oldTokens - newTokens;
                break;
              }
              case 'raw_part': {
                newText = `[Unknown Part degraded to text to preserve context window.]`;
                const oldTokens = this.env.tokenCalculator.estimateTokensForParts([
                  part.part,
                ]);
                const newTokens = this.env.tokenCalculator.estimateTokensForParts([
                  { text: newText },
                ]);
                tokensSaved = oldTokens - newTokens;
                break;
              }
            }

            if (newText && tokensSaved > 0) {
              newParts[j] = { type: 'text', text: newText };
              modified = true;
            }
          }

          if (modified) {
            const degradedNode: UserPrompt = {
              ...node,
              id: this.env.idGenerator.generateId(),
              semanticParts: newParts,
            };
            returnedNodes.push(degradedNode);
          } else {
            returnedNodes.push(node);
          }
          break;
        }
        default:
          returnedNodes.push(node);
          break;
      }
    }

    return returnedNodes;
  }
}
