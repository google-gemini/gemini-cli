/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BuildRelaunchSpawnSpecParams {
  additionalNodeArgs: string[];
  additionalScriptArgs: string[];
  argv: string[];
  env: NodeJS.ProcessEnv;
  execArgv: string[];
}

export interface RelaunchSpawnSpec {
  args: string[];
  env: NodeJS.ProcessEnv;
}

export function buildRelaunchSpawnSpec({
  additionalNodeArgs,
  additionalScriptArgs,
  argv,
  env,
  execArgv,
}: BuildRelaunchSpawnSpecParams): RelaunchSpawnSpec {
  const scriptArgs = argv.slice(2);
  const newEnv: NodeJS.ProcessEnv = {
    ...env,
    GEMINI_CLI_NO_RELAUNCH: 'true',
  };

  if (env['IS_BINARY'] === 'true') {
    if (additionalNodeArgs.length > 0) {
      newEnv['NODE_OPTIONS'] = [newEnv['NODE_OPTIONS'], ...additionalNodeArgs]
        .filter(Boolean)
        .join(' ');
    }

    return {
      args: [...additionalScriptArgs, ...scriptArgs],
      env: newEnv,
    };
  }

  const script = argv[1];

  return {
    args: [
      ...execArgv,
      ...additionalNodeArgs,
      script,
      ...additionalScriptArgs,
      ...scriptArgs,
    ],
    env: newEnv,
  };
}
