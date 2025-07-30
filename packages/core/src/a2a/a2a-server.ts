/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration } from '@google/genai';
import {
  loadAgentTool,
  listAgentsTool,
  sendMessageTool,
  getTaskTool,
  cancelTaskTool,
} from './tools.js';

/**
 * Represents the A2A MCP Server, which provides a set of tools
 * for interacting with the A2A protocol.
 */
export class A2AServer {
  /**
   * Gets the list of function declarations for the A2A tools.
   * @returns An array of function declarations.
   */
  public getTools(): FunctionDeclaration[] {
    return [
      loadAgentTool,
      listAgentsTool,
      sendMessageTool,
      getTaskTool,
      cancelTaskTool,
    ];
  }
}
