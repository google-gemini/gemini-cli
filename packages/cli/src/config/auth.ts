/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@google/gemini-cli-core';
import { loadEnvironment } from './config.js';
import axios from 'axios';

async function checkVSCodeBridge(): Promise<boolean> {
  try {
    const response = await axios.get('http://localhost:7337/health', { 
      timeout: 1000 
    });
    return response.data.status === 'ok';
  } catch {
    return false;
  }
}

export const validateAuthMethod = async (authMethod: string): Promise<string | null> => {
  loadEnvironment();
  if (authMethod === AuthType.LOGIN_WITH_GOOGLE) {
    return null;
  }

  if (authMethod === AuthType.USE_COPILOT) {
    // Check if VSCode bridge is running
    const bridgeRunning = await checkVSCodeBridge();
    if (!bridgeRunning) {
      return `VSCode bridge is not running. To install and start it:

1. Open VSCode
2. Install the bridge extension:
   - cd packages/vscode-bridge
   - npm run package
   - code --install-extension gemini-copilot-bridge-0.1.0.vsix
3. Press Cmd/Ctrl+Shift+P to open command palette
4. Run "Gemini Copilot: Start Bridge" command
5. Wait for "Bridge started on port 7337" notification
6. Try again`;
    }
    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    if (!process.env.GEMINI_API_KEY) {
      return 'GEMINI_API_KEY environment variable not found. Add that to your .env and try again, no reload needed!';
    }
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    const hasVertexProjectLocationConfig =
      !!process.env.GOOGLE_CLOUD_PROJECT && !!process.env.GOOGLE_CLOUD_LOCATION;
    const hasGoogleApiKey = !!process.env.GOOGLE_API_KEY;
    if (!hasVertexProjectLocationConfig && !hasGoogleApiKey) {
      return (
        'Must specify GOOGLE_GENAI_USE_VERTEXAI=true and either:\n' +
        '• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n' +
        '• GOOGLE_API_KEY environment variable (if using express mode).\n' +
        'Update your .env and try again, no reload needed!'
      );
    }
    return null;
  }

  return 'Invalid auth method selected.';
};
