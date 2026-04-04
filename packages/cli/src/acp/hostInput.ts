/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as acp from '@agentclientprotocol/sdk';
import {
  ApprovalMode,
  QuestionType,
  type Question,
} from '@google/gemini-cli-core';
import { z } from 'zod';

export const ACP_HOST_INPUT_CAPABILITY_KEY = 'geminiCli.hostInput';
export const ACP_HOST_INPUT_REQUEST_METHOD = 'gemini/requestUserInput';
export const ACP_HOST_INPUT_KINDS = ['ask_user', 'exit_plan_mode'] as const;
const FIRST_QUESTION_INDEX = '0';

export type HostInputKind = (typeof ACP_HOST_INPUT_KINDS)[number];
export interface HostInputSupport {
  askUser: boolean;
  exitPlanMode: boolean;
}

export const PLAN_APPROVAL_AUTO_OPTION = 'Yes, automatically accept edits';
export const PLAN_APPROVAL_MANUAL_OPTION = 'Yes, manually accept edits';

const HostInputCapabilitySchema = z.object({
  requestUserInput: z.boolean().optional(),
  supportedKinds: z.array(z.enum(ACP_HOST_INPUT_KINDS)).optional(),
  version: z.number().int().positive().optional(),
});

const HostInputResponseSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('submitted'),
    answers: z.record(z.string()),
  }),
  z.object({
    outcome: z.literal('cancelled'),
  }),
]);

export type HostInputResponse = z.infer<typeof HostInputResponseSchema>;

export interface HostInputRequest {
  sessionId: string;
  requestId: string;
  kind: 'ask_user' | 'exit_plan_mode';
  title: string;
  questions: Question[];
  extraParts?: string[];
  toolCall?: {
    toolCallId: string;
    title: string;
    locations?: acp.ToolCallLocation[];
    kind: acp.ToolKind;
  };
  _meta?: Record<string, unknown>;
}

export function buildHostInputAgentCapability(): Record<string, unknown> {
  return {
    version: 1,
    requestUserInput: true,
    method: ACP_HOST_INPUT_REQUEST_METHOD,
    supportedKinds: [...ACP_HOST_INPUT_KINDS],
  };
}

export function resolveHostInputSupport(
  clientCapabilities?: acp.ClientCapabilities,
): HostInputSupport {
  const capability = clientCapabilities?._meta?.[ACP_HOST_INPUT_CAPABILITY_KEY];
  const parsed = HostInputCapabilitySchema.safeParse(capability);
  if (!parsed.success) {
    return {
      askUser: false,
      exitPlanMode: false,
    };
  }

  if (parsed.data.requestUserInput !== true) {
    return {
      askUser: false,
      exitPlanMode: false,
    };
  }

  const supportedKinds = new Set(
    parsed.data.supportedKinds ?? ACP_HOST_INPUT_KINDS,
  );

  return {
    askUser: supportedKinds.has('ask_user'),
    exitPlanMode: supportedKinds.has('exit_plan_mode'),
  };
}

export async function requestHostInput(
  connection: acp.AgentSideConnection,
  request: HostInputRequest,
): Promise<HostInputResponse> {
  const response = await connection.extMethod(ACP_HOST_INPUT_REQUEST_METHOD, {
    ...request,
  });
  return HostInputResponseSchema.parse(response);
}

export function buildExitPlanModeQuestions(planContent: string): Question[] {
  return [
    {
      type: QuestionType.CHOICE,
      header: 'Approval',
      question: planContent,
      options: [
        {
          label: PLAN_APPROVAL_AUTO_OPTION,
          description: 'Approves plan and allows tools to run automatically',
        },
        {
          label: PLAN_APPROVAL_MANUAL_OPTION,
          description: 'Approves plan but requires confirmation for each tool',
        },
      ],
      placeholder: 'Type your feedback...',
      multiSelect: false,
      unconstrainedHeight: false,
    },
  ];
}

export function mapExitPlanModeAnswers(answers: Record<string, string>): {
  approved: boolean;
  approvalMode?: ApprovalMode;
  feedback?: string;
} {
  const answer = answers[FIRST_QUESTION_INDEX];

  if (answer === PLAN_APPROVAL_AUTO_OPTION) {
    return {
      approved: true,
      approvalMode: ApprovalMode.AUTO_EDIT,
    };
  }

  if (answer === PLAN_APPROVAL_MANUAL_OPTION) {
    return {
      approved: true,
      approvalMode: ApprovalMode.DEFAULT,
    };
  }

  if (answer) {
    return {
      approved: false,
      feedback: answer,
    };
  }

  return {
    approved: false,
  };
}
