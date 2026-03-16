import crypto from 'node:crypto';
import path from 'node:path';
import fsPromises from 'node:fs/promises';
import toml from '@iarna/toml';
import { MessageBusType, QuestionType } from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { debugLogger } from '../index.js';

export async function promptSandboxExpansion(
  messageBus: MessageBus,
  blockedPath: string,
  cwd: string
): Promise<'Allow Once' | 'Always Allow' | 'Deny'> {
  const decision = await new Promise<'Allow Once' | 'Always Allow' | 'Deny'>((resolve) => {
    const correlationId = crypto.randomUUID();
    const handler = (msg: any) => {
      if (msg.type === MessageBusType.ASK_USER_RESPONSE && msg.correlationId === correlationId) {
        messageBus.unsubscribe(MessageBusType.ASK_USER_RESPONSE, handler);
        if (msg.cancelled || !msg.answers['0']) {
          resolve('Deny');
        } else {
          resolve(msg.answers['0'] as 'Allow Once' | 'Always Allow' | 'Deny');
        }
      }
    };
    messageBus.subscribe(MessageBusType.ASK_USER_RESPONSE, handler);
    messageBus.publish({
      type: MessageBusType.ASK_USER_REQUEST,
      correlationId,
      questions: [{
        type: QuestionType.CHOICE,
        header: `Sandbox blocked access to ${blockedPath}.`,
        question: `The sandbox prevented this command from accessing a file outside the workspace.`,
        options: [
          { label: 'Allow Once', description: 'Temporarily allow for this execution.' },
          { label: 'Always Allow', description: 'Permanently allow for future executions.' },
          { label: 'Deny', description: 'Do not allow access.' },
        ]
      }]
    });
  });

  if (decision === 'Always Allow') {
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
      if (!allowedPathsList.includes(blockedPath)) {
        allowedPathsList.push(blockedPath);
        sandboxSection['allowedPaths'] = allowedPathsList;
        parsed['sandbox'] = sandboxSection;
        await fsPromises.writeFile(tomlPath, toml.stringify(parsed as any));
      }
    } catch (e) {
      debugLogger.error('Failed to update sandboxing.toml:', e);
    }
  }

  return decision;
}
