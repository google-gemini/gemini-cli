import {
  RoutingStrategy,
  RoutingContext,
  RoutingDecision,
} from '../routingStrategy';
import { Config } from '../../config/config';
import { BaseLlmClient } from '../../core/baseLlmClient';
import {
  GEMINI_MODEL_ALIAS_IMAGE,
  GEMINI_MODEL_ALIAS_FLASH_LITE_IMAGE,
  resolveModel,
  DEFAULT_GEMINI_MODEL,
} from '../../config/models';

export class ImageStrategy implements RoutingStrategy {
  readonly name = 'image';

  async route(
    context: RoutingContext,
    config: Config,
    baseLlmClient: BaseLlmClient,
  ): Promise<RoutingDecision | null> {
    const hasImage = context.request.parts.some(
      (part) =>
        'inlineData' in part && part.inlineData?.mimeType.startsWith('image/'),
    );

    const textRequest = context.request.parts
      .map((part) => ('text' in part ? part.text : ''))
      .join(' ');

    const requestsImageGeneration = /generate an image|create an image|draw a picture/i.test(textRequest);

    if (hasImage || requestsImageGeneration) {
      const preferredGeneralModel = config.getModel();
      // Resolve the general model preference to its concrete name
      const resolvedGeneralModel = resolveModel(preferredGeneralModel, config.getPreviewFeatures());

      const modelToUse: string = resolvedGeneralModel.includes('flash-lite')
        ? GEMINI_MODEL_ALIAS_FLASH_LITE_IMAGE
        : config.getPreviewFeatures() ? 'gemini-2.5-pro-image-preview' : DEFAULT_GEMINI_MODEL;

      return {
        model: modelToUse,
        metadata: {
          source: this.name,
          latencyMs: 0, // Placeholder, actual measurement needed
          reasoning: hasImage ? 'Request contains an image.' : 'Request for image generation.',
        },
      };
    }

    return null;
  }
}