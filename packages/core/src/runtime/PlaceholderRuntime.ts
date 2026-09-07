/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RuntimeResult {
  content: string;
  role: 'assistant' | 'system';
}

export interface ZoeRuntime {
  process(input: string): Promise<RuntimeResult>;
}

export class PlaceholderRuntime implements ZoeRuntime {
  async process(_input: string): Promise<RuntimeResult> {
    return {
      content: 'Zoe core is running.',
      role: 'assistant',
    };
  }
}
