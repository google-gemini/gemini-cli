/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export type IntentType =
  | 'learn'
  | 'solve'
  | 'debug'
  | 'review'
  | 'explain'
  | 'hint'
  | 'ponytail'
  | 'default';

export interface MentorPolicy {
  readonly intent: IntentType;
  readonly name: string;
  readonly description: string;
  getDirectives(): string;
}
