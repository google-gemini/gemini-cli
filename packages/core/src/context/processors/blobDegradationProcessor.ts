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

  readonly id = 'BlobDegradationProcessor';
  readonly name = 'BlobDegradationProcessor';
  readonly options = {};
  private env: ContextEnvironment;

  constructor(env: ContextEnvironment) {
    this.env = env;
  }

  async process({ targets, state }: ProcessArgs): Promise<ReadonlyArray<ConcreteNode>> {
    if (state.isBudgetSatisfied) {
      return targets;
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

    const returnedNodes: ConcreteNode[] = [];

    // Forward scan, looking for bloated non-text parts to degrade
    for (const node of targets) {
      if (currentDeficit <= 0 || node.type !== 'USER_PROMPT') {
        returnedNodes.push(node);
        continue;
      }

      const prompt = node as UserPrompt;
      let modified = false;
      const newParts = [...prompt.semanticParts];

      for (let j = 0; j < prompt.semanticParts.length; j++) {
        const part = prompt.semanticParts[j];
        if (currentDeficit <= 0) break;
        // We only target non-text parts that haven't already been masked
        if (part.type === 'text') continue;

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
          // Replace the part with a synthetic text part
          newParts[j] = { type: 'text', text: newText };
          currentDeficit -= tokensSaved;
          modified = true;
        }
      }

      if (modified) {
        // Return a fresh synthetic node representing the degraded state
        const degradedNode: UserPrompt = {
           ...prompt,
           id: this.env.idGenerator.generateId(), // Issue a new ID because it was modified
           semanticParts: newParts,
           metadata: {
             ...prompt.metadata,
             transformations: [
               ...prompt.metadata.transformations,
               {
                 processorName: this.name,
                 action: 'DEGRADED',
                 timestamp: Date.now(),
               }
             ]
           }
        };
        returnedNodes.push(degradedNode);
      } else {
        returnedNodes.push(node);
      }
    }

    return returnedNodes;
  }
}
