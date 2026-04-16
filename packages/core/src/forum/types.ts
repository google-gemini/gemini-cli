/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolConfig, RunConfig } from '../agents/types.js';
import type { ModelConfig } from '../services/modelConfigService.js';

export type ForumMemberRole = 'discussant' | 'synthesizer';

export interface ForumPresetMember {
  memberId: string;
  agentName: string;
  label?: string;
  role?: ForumMemberRole;
  systemPrompt?: string;
  modelConfig?: ModelConfig;
  toolConfig?: ToolConfig;
  runConfig?: RunConfig;
  workspaceDirectories?: string[];
}

export interface ForumPreset {
  name: string;
  description?: string;
  maxRounds?: number;
  minDiscussionRounds?: number;
  members: ForumPresetMember[];
  source?: {
    path: string;
    scope: 'user' | 'workspace';
  };
}

export interface ForumSessionOptions {
  includeMainConversationContext?: boolean;
}

export type ForumTranscriptEntry =
  | {
      kind: 'system';
      timestamp: number;
      text: string;
    }
  | {
      kind: 'user';
      timestamp: number;
      text: string;
      isTask: boolean;
    }
  | {
      kind: 'agent';
      timestamp: number;
      memberId: string;
      label: string;
      text: string;
      round: number;
      readyToConclude: boolean;
    }
  | {
      kind: 'activity';
      timestamp: number;
      memberId: string;
      label: string;
      activityKind: 'thinking' | 'tool' | 'error';
      text: string;
    }
  | {
      kind: 'final';
      timestamp: number;
      memberId: string;
      label: string;
      text: string;
    };

export type ForumMemberExecutionState =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'posted'
  | 'error'
  | 'stopped';

export interface ForumMemberState {
  memberId: string;
  label: string;
  role: ForumMemberRole;
  status: ForumMemberExecutionState;
  lastPost?: string;
  lastError?: string;
}

export type ForumSessionStatus =
  | 'inactive'
  | 'waiting_for_task'
  | 'running'
  | 'synthesizing'
  | 'completed'
  | 'stopped'
  | 'error';

export interface ForumSessionSnapshot {
  presetName: string;
  status: ForumSessionStatus;
  round: number;
  task?: string;
  pendingSteerCount: number;
  members: ForumMemberState[];
}

export interface ForumRoundPost {
  message: string;
  readyToConclude: boolean;
}

export interface ForumMemberRoundResult {
  memberId: string;
  label: string;
  post?: ForumRoundPost;
  error?: string;
  aborted?: boolean;
}

export interface ForumControllerCallbacks {
  onSnapshot?: (snapshot: ForumSessionSnapshot) => void;
  onTranscriptEntry?: (entry: ForumTranscriptEntry) => void;
}

export interface ForumMemberActivity {
  memberId: string;
  label: string;
  activityKind: 'thinking' | 'tool' | 'error';
  text: string;
}
