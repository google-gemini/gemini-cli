/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { listAgySessions, loadAgySession } from './discovery.js';
import { trajectoryToJson } from './teleporter.js';
import { convertAgyToCliRecord } from './converter.js';
import type {
  TrajectoryProvider,
  ConversationRecord,
} from '../config/config.js';

/**
 * Trajectory provider for Antigravity (Jetski) sessions.
 */
const agyProvider: TrajectoryProvider = {
  prefix: 'agy:',
  displayName: 'Antigravity',

  async listSessions(workspaceUri?: string) {
    const sessions = await listAgySessions(workspaceUri);
    return sessions.map((s) => ({
      id: s.id,
      mtime: s.mtime,
      displayName: s.displayName,
      messageCount: s.messageCount,
    }));
  },

  async loadSession(id: string): Promise<ConversationRecord | null> {
    const data = await loadAgySession(id);
    if (!data) return null;
    const json = trajectoryToJson(data);
    return convertAgyToCliRecord(json);
  },
};

export default agyProvider;
