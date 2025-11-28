import { describe, it, expect } from 'vitest';
import { ImageStrategy } from './ImageStrategy';
import { DEFAULT_GEMINI_MODEL } from '../../config/models';
import { RoutingContext } from '../routingStrategy';
import { Config } from '../../config/config';

describe('ImageStrategy', () => {
  it('should return an image model decision if the request contains an image and preview features are enabled', async () => {
    const strategy = new ImageStrategy();
    const context = {
      request: {
        parts: [
          { text: 'Describe this image' },
          { inlineData: { mimeType: 'image/png', data: 'base64...' } },
        ],
      },
    } as RoutingContext;

    const decision = await strategy.route(context, { getPreviewFeatures: () => true } as Config);

    expect(decision).toEqual({
      model: 'gemini-2.5-pro-image-preview',
      metadata: {
        source: 'ImageStrategy',
        latencyMs: 0,
        reasoning: 'Request contains an image.',
      },
    });
  });

  it('should return a pro model decision if the request contains an image and preview features are disabled', async () => {
    const strategy = new ImageStrategy();
    const context = {
      request: {
        parts: [
          { text: 'Describe this image' },
          { inlineData: { mimeType: 'image/png', data: 'base64...' } },
        ],
      },
    } as RoutingContext;

    const decision = await strategy.route(context, { getPreviewFeatures: () => false } as Config);

    expect(decision).toEqual({
        model: DEFAULT_GEMINI_MODEL,
        metadata: {
            source: 'ImageStrategy',
            latencyMs: 0,
            reasoning: 'Request contains an image.',
        },
    });
  });

  it('should return an image model decision if the request asks to generate an image and preview features are enabled', async () => {
    const strategy = new ImageStrategy();
    const context = {
      request: {
        parts: [{ text: 'generate an image of a cat' }],
      },
    } as RoutingContext;

    const decision = await strategy.route(context, { getPreviewFeatures: () => true } as Config);

    expect(decision).toEqual({
      model: 'gemini-2.5-pro-image-preview',
      metadata: {
        source: 'ImageStrategy',
        latencyMs: 0,
        reasoning: 'Request for image generation.',
      },
    });
  });

  it('should return a pro model decision if the request asks to generate an image and preview features are disabled', async () => {
    const strategy = new ImageStrategy();
    const context = {
      request: {
        parts: [{ text: 'create an image of a dog' }],
      },
    } as RoutingContext;

    const decision = await strategy.route(context, { getPreviewFeatures: () => false } as Config);

    expect(decision).toEqual({
        model: DEFAULT_GEMINI_MODEL,
        metadata: {
            source: 'ImageStrategy',
            latencyMs: 0,
            reasoning: 'Request for image generation.',
        },
    });
  });

  it('should return null if the request does not contain an image', async () => {
    const strategy = new ImageStrategy();
    const context = {
      request: {
        parts: [{ text: 'Hello, world!' }],
      },
    } as RoutingContext;

    const decision = await strategy.route(context, {} as Config);

    expect(decision).toBeNull();
  });
});