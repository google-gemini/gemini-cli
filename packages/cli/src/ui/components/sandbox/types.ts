/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ProjectType {
  WEB_APP = 'web_app',
  CLI_TOOL = 'cli_tool',
  API_SERVER = 'api_server',
  DATA_SCIENCE = 'data_science',
  CUSTOM = 'custom',
}

export type PolicyDecisionValue = 'allow' | 'ask_user' | 'deny';

export interface ToolPermissions {
  fileRead: PolicyDecisionValue;
  fileWrite: PolicyDecisionValue;
  shellCommands: PolicyDecisionValue;
  webSearch: PolicyDecisionValue;
  webFetch: PolicyDecisionValue;
  mcpServers: PolicyDecisionValue;
}

export enum SandboxMethod {
  NONE = 'none',
  DOCKER = 'docker',
  SEATBELT = 'seatbelt',
  GVISOR = 'gvisor',
}

export interface WizardData {
  projectType: ProjectType;
  permissions: ToolPermissions;
  sandboxMethod: SandboxMethod;
}

export enum WizardStep {
  PROJECT_TYPE = 1,
  PERMISSIONS = 2,
  SANDBOX_METHOD = 3,
  REVIEW = 4,
}

export const PROJECT_TYPE_PRESETS: Record<ProjectType, ToolPermissions> = {
  [ProjectType.WEB_APP]: {
    fileRead: 'allow',
    fileWrite: 'ask_user',
    shellCommands: 'ask_user',
    webSearch: 'allow',
    webFetch: 'allow',
    mcpServers: 'ask_user',
  },
  [ProjectType.CLI_TOOL]: {
    fileRead: 'allow',
    fileWrite: 'ask_user',
    shellCommands: 'ask_user',
    webSearch: 'allow',
    webFetch: 'deny',
    mcpServers: 'deny',
  },
  [ProjectType.API_SERVER]: {
    fileRead: 'allow',
    fileWrite: 'ask_user',
    shellCommands: 'ask_user',
    webSearch: 'allow',
    webFetch: 'allow',
    mcpServers: 'ask_user',
  },
  [ProjectType.DATA_SCIENCE]: {
    fileRead: 'allow',
    fileWrite: 'allow',
    shellCommands: 'allow',
    webSearch: 'allow',
    webFetch: 'allow',
    mcpServers: 'deny',
  },
  [ProjectType.CUSTOM]: {
    fileRead: 'allow',
    fileWrite: 'ask_user',
    shellCommands: 'ask_user',
    webSearch: 'ask_user',
    webFetch: 'ask_user',
    mcpServers: 'ask_user',
  },
};
