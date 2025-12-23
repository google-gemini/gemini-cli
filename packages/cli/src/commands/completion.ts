/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, Argv } from 'yargs';
import process from 'node:process';
import { writeSync } from 'node:fs';

const BASH_COMPLETION_TEMPLATE = `###-begin-gemini-completions-###
#
# yargs command completion script
#
# Installation: gemini completion >> ~/.bashrc
#    or gemini completion >> ~/.bash_profile on OSX.
#
_gemini_yargs_completions()
{
    local cur_word args type_list

    cur_word="\${COMP_WORDS[COMP_CWORD]}"
    args=("\${COMP_WORDS[@]}")

    type_list=$(gemini --get-yargs-completions "\${args[@]}" | grep -v "^\\$0" | grep -v "^completion-internal")

    COMPREPLY=( $(compgen -W "\${type_list}" -- \${cur_word}) )

    # if no match was found, fall back to filename completion
    if [ \${#COMPREPLY[@]} -eq 0 ]; then
      COMPREPLY=()
    fi

    return 0
}
complete -o bashdefault -o default -F _gemini_yargs_completions gemini
###-end-gemini-completions-###`;

const ZSH_COMPLETION_TEMPLATE = `###-begin-gemini-completions-###
#
# yargs command completion script
#
# Installation: gemini completion >> ~/.zshrc
#    or gemini completion >> ~/.zprofile on OSX.
#
_gemini_yargs_completions()
{
  local reply
  local si=$IFS
  IFS=$'
' reply=($(COMP_CWORD="$((CURRENT-1))" COMP_LINE="$BUFFER" COMP_POINT="$CURSOR" gemini --get-yargs-completions "\${words[@]}" | grep -v "^\\$0" | grep -v "^completion-internal"))
  IFS=$si
  _describe 'values' reply
}
compdef _gemini_yargs_completions gemini
###-end-gemini-completions-###
`;

const FISH_COMPLETION_TEMPLATE = `
function _gemini_completions
    set -l cmd (commandline -opc)
    set -l cursor (commandline -ct)
    gemini --get-yargs-completions $cmd $cursor | string match -v '$0*' | string match -v 'completion-internal*'
end
complete -f -c gemini -a "(_gemini_completions)"
`;

const POWERSHELL_COMPLETION_TEMPLATE = `
Register-ArgumentCompleter -Native -CommandName gemini -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    $completions = gemini --get-yargs-completions "$commandAst"
    $completions | Where-Object { $_ -notlike '$0*' -and $_ -notlike 'completion-internal*' } | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}
`;

export const completionCommand: CommandModule = {
  command: 'completion [shell]',
  describe: 'Generate completion script',
  builder: (yargs: Argv) =>
    yargs
      .positional('shell', {
        describe: 'The shell to generate the completion script for',
        choices: ['bash', 'zsh', 'fish', 'powershell'],
        type: 'string',
      })
      .option('install', {
        describe:
          'Install the completion script automatically (not implemented yet)',
        type: 'boolean',
        hidden: true,
      }),
  handler: (argv) => {
    let shell = argv['shell'] as string;

    if (!shell) {
      // Auto-detect shell
      const shellPath = process.env['SHELL'] || process.env['COMSPEC'];
      if (shellPath) {
        if (shellPath.endsWith('bash')) {
          shell = 'bash';
        } else if (shellPath.endsWith('zsh')) {
          shell = 'zsh';
        } else if (shellPath.endsWith('fish')) {
          shell = 'fish';
        } else if (
          shellPath.endsWith('pwsh') ||
          shellPath.endsWith('powershell.exe')
        ) {
          shell = 'powershell';
        }
      }
    }

    if (!shell) {
      // Default to bash if detection fails
      shell = 'bash';
    }

    switch (shell) {
      case 'bash':
        writeSync(1, BASH_COMPLETION_TEMPLATE + '\n');
        process.exit(0);
        break;
      case 'zsh':
        writeSync(1, ZSH_COMPLETION_TEMPLATE + '\n');
        process.exit(0);
        break;
      case 'fish':
        writeSync(1, FISH_COMPLETION_TEMPLATE + '\n');
        process.exit(0);
        break;
      case 'powershell':
        writeSync(1, POWERSHELL_COMPLETION_TEMPLATE + '\n');
        process.exit(0);
        break;
      default:
        console.error(`Unsupported shell: ${shell}`);
        process.exit(1);
    }
  },
};
