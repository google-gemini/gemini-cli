/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
import type { JSONSchemaType } from 'ajv';
import type { ProcessArgs, ContextProcessor } from '../pipeline.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ConcreteNode } from '../graph/types.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import { sanitizeFilenamePart } from '../../utils/fileUtils.js';

export type BlobDegradationProcessorOptions = Record<string, never>;

export const BlobDegradationProcessorOptionsSchema: JSONSchemaType<BlobDegradationProcessorOptions> =
  {
    type: 'object',
    properties: {},
    required: [],
  };

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

      let blobOutputsDir = path.join(env.projectTempDir, 'degraded-blobs');
      const sessionId = env.sessionId;
      if (sessionId) {
        blobOutputsDir = path.join(
          blobOutputsDir,
          `session-${sanitizeFilenamePart(sessionId)}`,
        );
      }

      const ensureDir = async () => {
        if (!directoryCreated) {
          await fs.mkdir(blobOutputsDir, { recursive: true });
          directoryCreated = true;
        }
      };

      const returnedNodes: ConcreteNode[] = [];

      // Forward scan, looking for bloated non-text parts to degrade
      for (const node of targets) {
        const payload = node.payload;
        let newText = '';
        let tokensSaved = 0;

        if (payload.inlineData?.data && payload.inlineData?.mimeType) {
          await ensureDir();
          const ext = payload.inlineData.mimeType.split('/')[1] || 'bin';
          const fileName = `blob_${Date.now()}_${randomUUID()}.${ext}`;
          const filePath = path.join(blobOutputsDir, fileName);

          const buffer = Buffer.from(payload.inlineData.data, 'base64');
          await fs.writeFile(filePath, buffer);

          const mb = (buffer.byteLength / 1024 / 1024).toFixed(2);
          newText = `[Multi-Modal Blob (${payload.inlineData.mimeType}, ${mb}MB) degraded to text to preserve context window. Saved to: ${filePath}]`;

          const oldTokens = env.tokenCalculator.estimateTokensForParts([
            payload,
          ]);
          const newTokens = env.tokenCalculator.estimateTokensForParts([
            { text: newText },
          ]);
          tokensSaved = oldTokens - newTokens;
        } else if (payload.fileData?.mimeType && payload.fileData?.fileUri) {
          newText = `[File Reference (${payload.fileData.mimeType}) degraded to text to preserve context window. Original URI: ${payload.fileData.fileUri}]`;
          const oldTokens = env.tokenCalculator.estimateTokensForParts([
            payload,
          ]);
          const newTokens = env.tokenCalculator.estimateTokensForParts([
            { text: newText },
          ]);
          tokensSaved = oldTokens - newTokens;
        }

        if (newText && tokensSaved > 0) {
          returnedNodes.push({
            ...node,
            id: randomUUID(),
            payload: { text: newText },
            replacesId: node.id,
            turnId: node.turnId,
          });
        } else {
          returnedNodes.push(node);
        }
      }

      return returnedNodes;
    },
  };
}
