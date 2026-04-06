/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import { IrMapper } from './mapper.js';
import type { Episode } from './types.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type { ContextEnvironment } from '../sidecar/environment.js';

export class IrProjector {
  /**
   * Converts the internal IR graph into a flat Content[] array for the LLM.
   * If tracing is enabled via environment variables, dumps the payload to disk.
   */
  static async projectAndDump(episodes: Episode[], env: ContextEnvironment): Promise<Content[]> {
    const contents = IrMapper.fromIr(episodes);

    if (process.env['GEMINI_DUMP_CONTEXT'] === 'true') {
      try {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const dumpPath = path.join(env.getTraceDir(), '.gemini', 'projected_context.json');
        await fs.mkdir(path.dirname(dumpPath), { recursive: true });
        await fs.writeFile(dumpPath, JSON.stringify(contents, null, 2), 'utf-8');
        debugLogger.log(`[Observability] Context successfully dumped to ${dumpPath}`);
      } catch (e) {
        debugLogger.error(`Failed to dump context: ${e}`);
      }
    }

    return contents;
  }
}
