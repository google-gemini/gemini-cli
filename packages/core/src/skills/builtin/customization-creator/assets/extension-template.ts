// Entry point for a Gemini CLI Extension (npm package)
// This file exports the commands and hooks provided by the extension.
// It is referenced by the "main" field in package.json.

import myCommand from './commands/my-command.js';
import myHook from './hooks/my-hook.js';

export const commands = [myCommand];
export const hooks = [myHook];

export function activate() {
  // Optional: Run setup logic when the extension is loaded
  // console.log('My Extension Activated');
}

export function deactivate() {
  // Optional: Run cleanup logic when the extension is unloaded
}