import { describe, it, expect, vi } from 'vitest';
import { ImageStrategy } from './ImageStrategy';
import { DEFAULT_GEMINI_MODEL, GEMINI_MODEL_ALIAS_FLASH_LITE_IMAGE } from '../../config/models';
import { RoutingContext } from '../routingStrategy';
import { Config } from '../../config/config';

describe('ImageStrategy', () => {
  const mockConfig = {
    getModel: vi.fn(),
    getPreviewFeatures: vi.fn(),
  } as unknown as Config;

  it('should return flash-lite image model if request has image and flash-lite is preferred general model', async () => {
    const strategy = new ImageStrategy();
    const context = {
      request: {
        parts: [
          { text: 'Describe this image' },
          { inlineData: { mimeType: 'image/png', data: 'base64...' } },
        ],
      },
    } as RoutingContext;

    // Mock config to return flash-lite as preferred general model
    vi.spyOn(mockConfig, 'getModel').mockReturnValue('flash-lite');
    vi.spyOn(mockConfig, 'getPreviewFeatures').mockReturnValue(true);

    const decision = await strategy.route(context, mockConfig, {} as any);

    expect(decision).toEqual({
      model: GEMINI_MODEL_ALIAS_FLASH_LITE_IMAGE,
      metadata: {
        source: 'image',
        latencyMs: 0,
        reasoning: 'Request contains an image.',
      },
    });
  });

  it('should return pro image model if request has image and pro is preferred general model (preview enabled)', async () => {
    const strategy = new ImageStrategy();
    const context = {
      request: {
        parts: [
          { text: 'Describe this image' },
          { inlineData: { mimeType: 'image/png', data: 'base64...' } },
        ],
      },
    } as RoutingContext;

    // Mock config to return pro as preferred general model
    vi.spyOn(mockConfig, 'getModel').mockReturnValue('pro');
    vi.spyOn(mockConfig, 'getPreviewFeatures').mockReturnValue(true);

    const decision = await strategy.route(context, mockConfig, {} as any);

    expect(decision).toEqual({
      model: 'gemini-2.5-pro-image-preview',
      metadata: {
        source: 'image',
        latencyMs: 0,
        reasoning: 'Request contains an image.',
      },
    });
  });

  it('should return default pro model if request has image and preview features are disabled', async () => {
    const strategy = new ImageStrategy();
    const context = {
      request: {
        parts: [
          { text: 'Describe this image' },
          { inlineData: { mimeType: 'image/png', data: 'base64...' } },
        ],
      },
    } as RoutingContext;

    // Mock config to disable preview features
    vi.spyOn(mockConfig, 'getPreviewFeatures').mockReturnValue(false);
    vi.spyOn(mockConfig, 'getModel').mockReturnValue('pro');

    const decision = await strategy.route(context, mockConfig, {} as any);

    expect(decision).toEqual({
      model: DEFAULT_GEMINI_MODEL,
      metadata: {
        source: 'image',
        latencyMs: 0,
        reasoning: 'Request contains an image.',
      },
    });
  });

  it('should return flash-lite image model if request asks to generate image and flash-lite is preferred general model', async () => {
    const strategy = new ImageStrategy();
    const context = {
      request: {
        parts: [{ text: 'generate an image of a cat' }],
      },
    } as RoutingContext;

    // Mock config to return flash-lite as preferred general model
    vi.spyOn(mockConfig, 'getModel').mockReturnValue('flash-lite');
    vi.spyOn(mockConfig, 'getPreviewFeatures').mockReturnValue(true);

    const decision = await strategy.route(context, mockConfig, {} as any);

    expect(decision).toEqual({
      model: GEMINI_MODEL_ALIAS_FLASH_LITE_IMAGE,
      metadata: {
        source: 'image',
        latencyMs: 0,
        reasoning: 'Request for image generation.',
      },
    });
  });

  it('should return pro image model if request asks to generate image and pro is preferred general model (preview enabled)', async () => {
    const strategy = new ImageStrategy();
    const context = {
      request: {
        parts: [{ text: 'create an image of a dog' }],
      },
    } as RoutingContext;

    // Mock config to return pro as preferred general model
    vi.spyOn(mockConfig, 'getModel').mockReturnValue('pro');
    vi.spyOn(mockConfig, 'getPreviewFeatures').mockReturnValue(true);

    const decision = await strategy.route(context, mockConfig, {} as any);

    expect(decision).toEqual({
      model: 'gemini-2.5-pro-image-preview',
      metadata: {
        source: 'image',
        latencyMs: 0,
        reasoning: 'Request for image generation.',
      },
    });
  });

  it('should return pro model if request asks to generate image and preview features are disabled', async () => {
    const strategy = new ImageStrategy();
    const context = {
      request: {
        parts: [{ text: 'draw a picture of a bird' }],
      },
    } as RoutingContext;

    // Mock config to disable preview features
    vi.spyOn(mockConfig, 'getPreviewFeatures').mockReturnValue(false);
    vi.spyOn(mockConfig, 'getModel').mockReturnValue('pro');

    const decision = await strategy.route(context, mockConfig, {} as any);

    expect(decision).toEqual({
      model: DEFAULT_GEMINI_MODEL,
      metadata: {
        source: 'image',
        latencyMs: 0,
        reasoning: 'Request for image generation.',
      },
    });
  });

  it('should return null if the request does not contain an image or image generation request', async () => {
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