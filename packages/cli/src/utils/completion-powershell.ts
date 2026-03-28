/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates a PowerShell completion script for the Gemini CLI.
 * This script uses the built-in yargs --get-yargs-completions support.
 */
export function getPowerShellCompletionScript(binName: string): string {
  return `
function GeminiCompletion {
    param($commandName, $wordToComplete, $cursorPosition)
    $completionArgs = @("--get-yargs-completions")
    $completionArgs += $wordToComplete
    $completions = & ${binName} $completionArgs
    $completions | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}

Register-ArgumentCompleter -CommandName '${binName}' -ScriptBlock {
    param($commandName, $parameterName, $wordToComplete, $commandAst, $fakeBoundParameter)
    GeminiCompletion -commandName $commandName -wordToComplete $wordToComplete
}
`.trim();
}
