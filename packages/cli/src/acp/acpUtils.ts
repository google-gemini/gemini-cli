/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Config,
  type ToolResult,
  type ToolCallConfirmationDetails,
  Kind,
  ApprovalMode,
  GEMINI_MODEL_ALIAS_AUTO,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_FLASH_LITE_MODEL,
  getDisplayString,
  AuthType,
  ToolConfirmationOutcome,
  getAutoModelDescription,
} from '@google/gemini-cli-core';
import type * as acp from '@agentclientprotocol/sdk';
import { z } from 'zod';
import type { LoadedSettings } from '../config/settings.js';

export function hasMeta(
  obj: unknown,
): obj is { _meta?: Record<string, unknown> } {
  return typeof obj === 'object' && obj !== null && '_meta' in obj;
}

export const RequestPermissionResponseSchema = z.object({
  outcome: z.discriminatedUnion('outcome', [
    z.object({ outcome: z.literal('cancelled') }),
    z.object({
      outcome: z.literal('selected'),
      optionId: z.string(),
    }),
  ]),
});

export function toToolCallContent(
  toolResult: ToolResult,
): acp.ToolCallContent | null {
  if (toolResult.error?.message) {
    throw new Error(toolResult.error.message);
  }

  if (toolResult.returnDisplay) {
    if (typeof toolResult.returnDisplay === 'string') {
      return {
        type: 'content',
        content: { type: 'text', text: toolResult.returnDisplay },
      };
    } else {
      if ('fileName' in toolResult.returnDisplay) {
        return {
          type: 'diff',
          path:
            toolResult.returnDisplay.filePath ??
            toolResult.returnDisplay.fileName,
          oldText: toolResult.returnDisplay.originalContent,
          newText: toolResult.returnDisplay.newContent,
          _meta: {
            kind: !toolResult.returnDisplay.originalContent
              ? 'add'
              : toolResult.returnDisplay.newContent === ''
                ? 'delete'
                : 'modify',
          },
        };
      }
      return null;
    }
  } else {
    return null;
  }
}

const basicPermissionOptions = [
  {
    optionId: ToolConfirmationOutcome.ProceedOnce,
    name: 'Allow',
    kind: 'allow_once',
  },
  {
    optionId: ToolConfirmationOutcome.Cancel,
    name: 'Reject',
    kind: 'reject_once',
  },
] as const;

export function toPermissionOptions(
  confirmation: ToolCallConfirmationDetails,
  config: Config,
  enablePermanentToolApproval: boolean = false,
): acp.PermissionOption[] {
  const disableAlwaysAllow = config.getDisableAlwaysAllow();
  const options: acp.PermissionOption[] = [];

  if (!disableAlwaysAllow) {
    switch (confirmation.type) {
      case 'edit':
        options.push({
          optionId: ToolConfirmationOutcome.ProceedAlways,
          name: 'Allow for this session',
          kind: 'allow_always',
        });
        if (enablePermanentToolApproval) {
          options.push({
            optionId: ToolConfirmationOutcome.ProceedAlwaysAndSave,
            name: 'Allow for this file in all future sessions',
            kind: 'allow_always',
          });
        }
        break;
      case 'exec':
        options.push({
          optionId: ToolConfirmationOutcome.ProceedAlways,
          name: 'Allow for this session',
          kind: 'allow_always',
        });
        if (enablePermanentToolApproval) {
          options.push({
            optionId: ToolConfirmationOutcome.ProceedAlwaysAndSave,
            name: 'Allow this command for all future sessions',
            kind: 'allow_always',
          });
        }
        break;
      case 'mcp': {
        const serverName = confirmation.serverName?.trim() || 'generic_server';
        const toolName = confirmation.toolName?.trim() || 'generic_tool';
        options.push(
          {
            optionId: ToolConfirmationOutcome.ProceedAlwaysServer,
            name: `Allow all "${serverName}" server tools for this session`,
            kind: 'allow_always',
          },
          {
            optionId: ToolConfirmationOutcome.ProceedAlwaysTool,
            name: `Allow tool "${toolName}" for this session`,
            kind: 'allow_always',
          },
        );
        if (enablePermanentToolApproval) {
          options.push({
            optionId: ToolConfirmationOutcome.ProceedAlwaysAndSave,
            name: `Allow tool "${toolName}" for all future sessions`,
            kind: 'allow_always',
          });
        }
        break;
      }
      case 'info':
        options.push({
          optionId: ToolConfirmationOutcome.ProceedAlways,
          name: 'Allow for this session',
          kind: 'allow_always',
        });
        if (enablePermanentToolApproval) {
          options.push({
            optionId: ToolConfirmationOutcome.ProceedAlwaysAndSave,
            name: 'Allow for all future sessions',
            kind: 'allow_always',
          });
        }
        break;
      case 'ask_user':
      case 'exit_plan_mode':
        // askuser and exit_plan_mode don't need "always allow" options
        break;
      default:
        // No "always allow" options for other types
        break;
    }
  }

  options.push(...basicPermissionOptions);

  // Exhaustive check
  switch (confirmation.type) {
    case 'edit':
    case 'exec':
    case 'mcp':
    case 'info':
    case 'ask_user':
    case 'exit_plan_mode':
    case 'sandbox_expansion':
      break;
    default: {
      const unreachable: never = confirmation;
      throw new Error(`Unexpected: ${unreachable}`);
    }
  }

  return options;
}

export function toAcpToolKind(kind: Kind): acp.ToolKind {
  switch (kind) {
    case Kind.Read:
    case Kind.Edit:
    case Kind.Execute:
    case Kind.Search:
    case Kind.Delete:
    case Kind.Move:
    case Kind.Think:
    case Kind.Fetch:
    case Kind.SwitchMode:
    case Kind.Other:
      return kind as acp.ToolKind;
    case Kind.Agent:
      return 'think';
    case Kind.Plan:
    case Kind.Communicate:
    default:
      return 'other';
  }
}

export function buildAvailableModes(isPlanEnabled: boolean): acp.SessionMode[] {
  const modes: acp.SessionMode[] = [
    {
      id: ApprovalMode.DEFAULT,
      name: 'Default',
      description: 'Prompts for approval',
    },
    {
      id: ApprovalMode.AUTO_EDIT,
      name: 'Auto Edit',
      description: 'Auto-approves edit tools',
    },
    {
      id: ApprovalMode.YOLO,
      name: 'YOLO',
      description: 'Auto-approves all tools',
    },
  ];

  if (isPlanEnabled) {
    modes.push({
      id: ApprovalMode.PLAN,
      name: 'Plan',
      description: 'Read-only mode',
    });
  }

  return modes;
}

export function buildAvailableModels(
  config: Config,
  settings: LoadedSettings,
): {
  availableModels: Array<{
    modelId: string;
    name: string;
    description?: string;
  }>;
  currentModelId: string;
} {
  const preferredModel = config.getModel() || GEMINI_MODEL_ALIAS_AUTO;
  const shouldShowPreviewModels = config.getHasAccessToPreviewModel();
  const useGemini31 = config.getGemini31LaunchedSync?.() ?? false;
  const useLatestFlash = config.hasLatestFlashGAAccess?.() ?? false;
  const useLatestFlashLite = config.hasLatestFlashLiteGAAccess?.() ?? false;
  const selectedAuthType = settings.merged.security.auth.selectedType;
  const useCustomToolModel =
    useGemini31 && selectedAuthType === AuthType.USE_GEMINI;

  // --- DYNAMIC PATH ---
  if (
    config.getExperimentalDynamicModelConfiguration?.() === true &&
    config.getModelConfigService
  ) {
    const options = config.getModelConfigService().getAvailableModelOptions({
      useGemini3_1: useGemini31,
      useLatestFlash,
      useLatestFlashLite,
      useCustomTools: useCustomToolModel,
      hasAccessToPreview: shouldShowPreviewModels,
    });

    return {
      availableModels: options,
      currentModelId: preferredModel,
    };
  }

  // --- LEGACY PATH ---
  const mainOptions = [
    {
      value: GEMINI_MODEL_ALIAS_AUTO,
      title: getDisplayString(GEMINI_MODEL_ALIAS_AUTO),
      description: getAutoModelDescription(
        shouldShowPreviewModels,
        useGemini31,
        useLatestFlash,
      ),
    },
  ];

  const manualOptions = [
    {
      value: DEFAULT_GEMINI_MODEL,
      title: getDisplayString(DEFAULT_GEMINI_MODEL),
    },
    {
      value: DEFAULT_GEMINI_FLASH_MODEL,
      title: getDisplayString(DEFAULT_GEMINI_FLASH_MODEL),
    },
    {
      value: DEFAULT_GEMINI_FLASH_LITE_MODEL,
      title: getDisplayString(DEFAULT_GEMINI_FLASH_LITE_MODEL),
    },
  ];

  if (shouldShowPreviewModels) {
    const previewProModel = useGemini31
      ? PREVIEW_GEMINI_3_1_MODEL
      : PREVIEW_GEMINI_MODEL;

    const previewProValue = useCustomToolModel
      ? PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL
      : previewProModel;

    const previewOptions = [
      {
        value: previewProValue,
        title: getDisplayString(previewProModel),
      },
      {
        value: PREVIEW_GEMINI_FLASH_MODEL,
        title: getDisplayString(PREVIEW_GEMINI_FLASH_MODEL),
      },
    ];

    if (PREVIEW_GEMINI_FLASH_LITE_MODEL !== 'none') {
      previewOptions.push({
        value: PREVIEW_GEMINI_FLASH_LITE_MODEL,
        title: getDisplayString(PREVIEW_GEMINI_FLASH_LITE_MODEL),
      });
    }

    manualOptions.unshift(...previewOptions);
  }

  const scaleOptions = (
    options: Array<{ value: string; title: string; description?: string }>,
  ) =>
    options.map((o) => ({
      modelId: o.value,
      name: o.title,
      description: o.description,
    }));

  return {
    availableModels: [
      ...scaleOptions(mainOptions),
      ...scaleOptions(manualOptions),
    ],
    currentModelId: preferredModel,
  };
}

/** Key under which Gemini CLI publishes ACP extensions in `_meta` objects. */
export const GEMINI_ACP_META_KEY = 'geminicli.com';

/** Extension method that adds a user message to a running prompt turn. */
export const STEER_METHOD = `_${GEMINI_ACP_META_KEY}/session/steer`;

export const STEERING_VERSION = 1;
export const STEERING_MAX_PENDING = 20;
export const STEERING_MAX_CHARS = 8000;

export const SteerRequestSchema = z.object({
  sessionId: z.string(),
  content: z
    .array(z.object({ type: z.literal('text'), text: z.string() }))
    .min(1),
  _meta: z.record(z.unknown()).optional(),
});

export type SteerResponse =
  | { status: 'queued'; steerId: string; pending: number }
  | { status: 'no_active_turn' };

/**
 * Returns true when the client opted in to steering with
 * `clientCapabilities._meta["geminicli.com"].steering === true`.
 */
export function readSteeringOptIn(
  capabilities: acp.ClientCapabilities | undefined,
): boolean {
  const meta = hasMeta(capabilities) ? capabilities._meta : undefined;
  const ours = meta?.[GEMINI_ACP_META_KEY];
  return (
    typeof ours === 'object' &&
    ours !== null &&
    'steering' in ours &&
    ours.steering === true
  );
}

export function buildSteeringCapability(enabled: boolean) {
  return {
    [GEMINI_ACP_META_KEY]: {
      steering: {
        version: STEERING_VERSION,
        content: ['text'],
        maxPending: STEERING_MAX_PENDING,
        maxChars: STEERING_MAX_CHARS,
        enabled,
      },
    },
  };
}

export function steeringMeta(
  state: 'delivered' | 'undelivered',
  steerId?: string,
) {
  return {
    [GEMINI_ACP_META_KEY]: {
      steering: steerId ? { steerId, state } : { state },
    },
  };
}

const STEERING_HINT_PREFIX = 'User steering update:\n<user_input>\n';
const STEERING_HINT_SUFFIX = '\n</user_input>';

/**
 * Extracts the user's own words from text built by
 * `buildUserSteeringHintPrompt`, or returns null if the text is not steering.
 */
export function parseSteeringHint(text: string): string | null {
  if (!text.startsWith(STEERING_HINT_PREFIX)) {
    return null;
  }
  const end = text.indexOf(STEERING_HINT_SUFFIX, STEERING_HINT_PREFIX.length);
  if (end === -1) {
    return null;
  }
  const hint = text.slice(STEERING_HINT_PREFIX.length, end).trim();
  return hint.length > 0 ? hint : null;
}
