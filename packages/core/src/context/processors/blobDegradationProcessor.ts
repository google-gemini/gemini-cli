/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ProcessArgs, ContextProcessor } from '../pipeline.js';
import type { ConcreteNode, UserPrompt } from '../ir/types.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import { sanitizeFilenamePart } from '../../utils/fileUtils.js';

export function createBlobDegradationProcessor(
  id: string,
  env: ContextEnvironment,
): ContextProcessor {
  return {
    id,
    name: 'BlobDegradationProcessor',
    process: async ({ targets }: ProcessArgs) => {
    if (targets.length === 0) {
      return targets;
    }

    let directoryCreated = false;

    let blobOutputsDir = env.fileSystem.join(
      env.projectTempDir,
      'degraded-blobs',
    );
    const sessionId = env.sessionId;
    if (sessionId) {
      blobOutputsDir = env.fileSystem.join(
        blobOutputsDir,
        `session-${sanitizeFilenamePart(sessionId)}`,
      );
    }

    const ensureDir = async () => {
      if (!directoryCreated) {
        await env.fileSystem.mkdir(blobOutputsDir, { recursive: true });
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
                const fileName = `blob_${Date.now()}_${env.idGenerator.generateId()}.${ext}`;
                const filePath = env.fileSystem.join(
                  blobOutputsDir,
                  fileName,
                );

                const buffer = Buffer.from(part.data, 'base64');
                await env.fileSystem.writeFile(filePath, buffer);

                const mb = (buffer.byteLength / 1024 / 1024).toFixed(2);
                newText = `[Multi-Modal Blob (${part.mimeType}, ${mb}MB) degraded to text to preserve context window. Saved to: ${filePath}]`;

                const oldTokens =
                  env.tokenCalculator.estimateTokensForParts([
                    {
                      inlineData: { mimeType: part.mimeType, data: part.data },
                    },
                  ]);
                const newTokens =
                  env.tokenCalculator.estimateTokensForParts([
                    { text: newText },
                  ]);
                tokensSaved = oldTokens - newTokens;
                break;
              }
              case 'file_data': {
                newText = `[File Reference (${part.mimeType}) degraded to text to preserve context window. Original URI: ${part.fileUri}]`;
                const oldTokens =
                  env.tokenCalculator.estimateTokensForParts([
                    {
                      fileData: {
                        mimeType: part.mimeType,
                        fileUri: part.fileUri,
                      },
                    },
                  ]);
                const newTokens =
                  env.tokenCalculator.estimateTokensForParts([
                    { text: newText },
                  ]);
                tokensSaved = oldTokens - newTokens;
                break;
              }
              case 'raw_part': {
                newText = `[Unknown Part degraded to text to preserve context window.]`;
                const oldTokens =
                  env.tokenCalculator.estimateTokensForParts([part.part]);
                const newTokens =
                  env.tokenCalculator.estimateTokensForParts([
                    { text: newText },
                  ]);
                tokensSaved = oldTokens - newTokens;
                break;
              }
              default:
                break;
            }

            if (newText && tokensSaved > 0) {
              newParts[j] = { type: 'text', text: newText };
              modified = true;
            }
          }

          if (modified) {
            const degradedNode: UserPrompt = {
              ...node,
              id: env.idGenerator.generateId(),
              semanticParts: newParts,
              replacesId: node.id,
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
    },
  };
}
