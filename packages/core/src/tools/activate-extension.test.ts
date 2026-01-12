/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  ActivateExtensionTool,
  type ActivateExtensionToolParams,
} from './activate-extension.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import {
  ExtensionScope,
  type ExtensionLoader,
} from '../utils/extensionLoader.js';

describe('ActivateExtensionTool', () => {
  let mockConfig: Config;
  let tool: ActivateExtensionTool;
  let mockMessageBus: MessageBus;
  let mockExtensionLoader: ExtensionLoader;

  beforeEach(() => {
    mockMessageBus = createMockMessageBus();
    const extensions = [
      {
        name: 'test-extension',
        version: '1.0.0',
        isActive: false,
        path: '/path/to/test-extension',
        contextFiles: [],
        id: 'test-extension',
      },
      {
        name: 'active-extension',
        version: '1.0.0',
        isActive: true,
        path: '/path/to/active-extension',
        contextFiles: [],
        id: 'active-extension',
      },
    ];

    mockExtensionLoader = {
      getExtensions: vi.fn().mockReturnValue(extensions),
      enableExtension: vi.fn(),
      disableExtension: vi.fn(),
      start: vi.fn(),
    } as unknown as ExtensionLoader;

    mockConfig = {
      getExtensionLoader: vi.fn().mockReturnValue(mockExtensionLoader),
    } as unknown as Config;

    tool = new ActivateExtensionTool(mockConfig, mockMessageBus);
  });

  it('should build successfully with available disabled extensions', () => {
    const params = { name: 'test-extension' };
    const invocation = tool.build(params);
    expect(invocation).toBeDefined();
    expect(invocation.getDescription()).toBe(
      'Activate extension: test-extension',
    );
  });

  it('should throw error if extension is not in enum (including already active ones)', () => {
    expect(() =>
      tool.build({
        name: 'active-extension',
      } as unknown as ActivateExtensionToolParams),
    ).toThrow();
    expect(() =>
      tool.build({
        name: 'non-existent',
      } as unknown as ActivateExtensionToolParams),
    ).toThrow();
  });

  it('should activate a valid extension', async () => {
    const params = { name: 'test-extension' };
    const invocation = tool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(mockExtensionLoader.enableExtension).toHaveBeenCalledWith(
      'test-extension',
      ExtensionScope.Session,
    );
    expect(result.llmContent).toContain(
      'Extension "test-extension" activated successfully.',
    );
  });

  it('should handle activation error', async () => {
    (mockExtensionLoader.enableExtension as unknown as Mock).mockRejectedValue(
      new Error('Failed to enable'),
    );

    const params = { name: 'test-extension' };
    const invocation = tool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain(
      'Error activating extension: Failed to enable',
    );
  });
});
