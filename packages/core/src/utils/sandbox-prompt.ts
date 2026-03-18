/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import crypto from 'node:crypto';
import path from 'node:path';
import fsPromises from 'node:fs/promises';
import toml from '@iarna/toml';
import { MessageBusType } from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { debugLogger } from '../index.js';
import { ToolConfirmationOutcome } from '../tools/tools.js';

export async function addToSandboxingToml(cwd: string, allowedPath: string) {
  try {
    const configDir = path.join(path.resolve(cwd), '.gemini');
    const tomlPath = path.join(configDir, 'sandboxing.toml');
    let parsed: Record<string, unknown> = {};
    try {
      const content = await fsPromises.readFile(tomlPath, 'utf8');
      parsed = toml.parse(content) as Record<string, unknown>;
    } catch {
      await fsPromises.mkdir(configDir, { recursive: true });
    }
    const sandboxSection = (parsed['sandbox'] as Record<string, unknown>) || {};
    const allowedPathsList = (sandboxSection['allowedPaths'] as string[]) || [];
    if (!allowedPathsList.includes(allowedPath)) {
      allowedPathsList.push(allowedPath);
      sandboxSection['allowedPaths'] = allowedPathsList;
      parsed['sandbox'] = sandboxSection;
      await fsPromises.writeFile(tomlPath, toml.stringify(parsed as any));
    }
  } catch (e) {
    debugLogger.error('Failed to update sandboxing.toml:', e);
  }
}

export async function promptSandboxExpansion(
  messageBus: MessageBus,
  blockedPath: string,
  cwd: string,
  saveToSandboxingToml: boolean = true,
  requiresUnsandboxed: boolean = false
): Promise<'Allow Once' | 'Always Allow' | 'Deny'> {
  const decision = await new Promise<'Allow Once' | 'Always Allow' | 'Deny'>((resolve) => {
    const correlationId = crypto.randomUUID();
    const handler = (msg: unknown) => {
      if (msg && typeof msg === 'object' && 'type' in msg && msg.type === MessageBusType.TOOL_CONFIRMATION_RESPONSE && 'correlationId' in msg && msg.correlationId === correlationId) {
        messageBus.unsubscribe(MessageBusType.TOOL_CONFIRMATION_RESPONSE, handler);
        const m = msg as any;
        if (m.outcome === ToolConfirmationOutcome.ProceedOnce) {
          resolve('Allow Once');
        } else if (m.outcome === ToolConfirmationOutcome.ProceedAlwaysAndSave) {
          resolve('Always Allow');
        } else {
          resolve('Deny');
        }
      }
    };
    messageBus.subscribe(MessageBusType.TOOL_CONFIRMATION_RESPONSE, handler);
    void messageBus.publish({
      type: MessageBusType.SANDBOX_EXPANSION_REQUEST,
      correlationId,
      blockedPath,
    });
  });

  if (decision === 'Always Allow' && saveToSandboxingToml) {
    await addToSandboxingToml(cwd, blockedPath);
  }

  return decision;
}
