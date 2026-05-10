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
  DEFAULT_GEMINI_MODEL_AUTO,
  PREVIEW_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL,
  getDisplayString,
  AuthType,
  ToolConfirmationOutcome,
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
      case 'mcp':
        options.push(
          {
            optionId: ToolConfirmationOutcome.ProceedAlwaysServer,
            name: 'Allow all server tools for this session',
            kind: 'allow_always',
          },
          {
            optionId: ToolConfirmationOutcome.ProceedAlwaysTool,
            name: 'Allow tool for this session',
            kind: 'allow_always',
          },
        );
        if (enablePermanentToolApproval) {
          options.push({
            optionId: ToolConfirmationOutcome.ProceedAlwaysAndSave,
            name: 'Allow tool for all future sessions',
            kind: 'allow_always',
          });
        }
        break;
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
  const preferredModel = config.getModel() || DEFAULT_GEMINI_MODEL_AUTO;
  const shouldShowPreviewModels = config.getHasAccessToPreviewModel();
  const useGemini31 = config.getGemini31LaunchedSync?.() ?? false;
  const useGemini31FlashLite =
    config.getGemini31FlashLiteLaunchedSync?.() ?? false;
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
      useGemini3_1FlashLite: useGemini31FlashLite,
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
      value: DEFAULT_GEMINI_MODEL_AUTO,
      title: getDisplayString(DEFAULT_GEMINI_MODEL_AUTO),
      description:
        'Let Gemini CLI decide the best model for the task: gemini-2.5-pro, gemini-2.5-flash',
    },
  ];

  if (shouldShowPreviewModels) {
    mainOptions.unshift({
      value: PREVIEW_GEMINI_MODEL_AUTO,
      title: getDisplayString(PREVIEW_GEMINI_MODEL_AUTO),
      description: useGemini31
        ? 'Let Gemini CLI decide the best model for the task: gemini-3.1-pro, gemini-3-flash'
        : 'Let Gemini CLI decide the best model for the task: gemini-3-pro, gemini-3-flash',
    });
  }

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

    if (useGemini31FlashLite) {
      previewOptions.push({
        value: PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL,
        title: getDisplayString(PREVIEW_GEMINI_3_1_FLASH_LITE_MODEL),
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
