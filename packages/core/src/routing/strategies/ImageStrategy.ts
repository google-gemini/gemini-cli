import {
  RoutingStrategy,
  RoutingContext,
  RoutingDecision,
} from '../routingStrategy';
import { Config } from '../../config/config';
import { GEMINI_MODEL_ALIAS_IMAGE, resolveModel } from '../../config/models';

export class ImageStrategy implements RoutingStrategy {
  readonly name = 'image';

  async route(
    context: RoutingContext,
    config: Config,
  ): Promise<RoutingDecision | null> {
    const hasImage = context.request.parts.some(
      (part) =>
        'inlineData' in part && part.inlineData?.mimeType.startsWith('image/'),
    );

    const textRequest = context.request.parts
      .map((part) => ('text' in part ? part.text : ''))
      .join(' ');

    const requestsImageGeneration =
      /generate an image|create an image|draw a picture/i.test(textRequest);

    if (hasImage || requestsImageGeneration) {
      const model = resolveModel(
        GEMINI_MODEL_ALIAS_IMAGE,
        config.getPreviewFeatures(),
      );
      return {
        model,
        metadata: {
          source: 'ImageStrategy',
          latencyMs: 0,
          reasoning: hasImage
            ? 'Request contains an image.'
            : 'Request for image generation.',
        },
      };
    }

    return null;
  }
}
