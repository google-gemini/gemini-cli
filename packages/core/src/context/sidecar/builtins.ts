import { ProcessorRegistry } from './registry.js';
import { EmergencyTruncationProcessor, type EmergencyTruncationProcessorOptions } from '../processors/emergencyTruncationProcessor.js';
import { BlobDegradationProcessor } from '../processors/blobDegradationProcessor.js';

export function registerBuiltInProcessors(registry: ProcessorRegistry) {
  registry.register<Record<string, never>>({
    id: 'BlobDegradationProcessor',
    schema: {
      type: 'object',
      properties: {
        processorId: { const: 'BlobDegradationProcessor' },
        options: { type: 'object' },
      },
      required: ['processorId'],
    },
    create: (env) => new BlobDegradationProcessor(env),
  });

  registry.register<EmergencyTruncationProcessorOptions>({
    id: 'EmergencyTruncationProcessor',
    schema: {
      type: 'object',
      properties: {
        processorId: { const: 'EmergencyTruncationProcessor' },
        options: {
          type: 'object',
          properties: {
            target: { type: 'string', enum: ['incremental', 'freeNTokens', 'max'] },
            freeTokensTarget: { type: 'number' },
          },
        },
      },
      required: ['processorId'],
    },
    create: (env, options) =>
      EmergencyTruncationProcessor.create(env, options),
  });
}
