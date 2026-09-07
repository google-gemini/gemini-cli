/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ModelProvider, ChatRequest, ModelEvent } from '../ModelProvider.js';

export class PlaceholderProvider implements ModelProvider {
  public readonly name = 'placeholder';

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async *chat(_request: ChatRequest): AsyncIterable<ModelEvent> {
    const text = 'Zoe core is running.';
    yield { type: 'chunk', text };
    yield { type: 'complete', fullText: text };
  }
}
