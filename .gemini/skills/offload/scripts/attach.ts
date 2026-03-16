/**
 * Offload Attach Utility (Local)
 * 
 * Re-attaches to a running tmux session on the worker.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const q = (str: string) => `'${str.replace(/'/g, "'\\''")}'`;

export async function runAttach(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const prNumber = args[0];
  const action = args[1] || 'review';
  const isLocal = args.includes('--local');
  
  if (!prNumber) {
    console.error('Usage: npm run offload:attach <PR_NUMBER> [action] [--local]');
    return 1;
  }

  // ... (load settings)
  const settingsPath = path.join(REPO_ROOT, '.gemini/settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const config = settings.maintainer?.deepReview;
  if (!config) {
    console.error('❌ Settings not found. Run "npm run offload:setup" first.');
    return 1;
  }

  const { remoteHost } = config;
  const sshConfigPath = path.join(REPO_ROOT, '.gemini/offload_ssh_config');
  const sessionName = `offload-${prNumber}-${action}`;
  const finalSSH = `ssh -F ${sshConfigPath} -t ${remoteHost} "tmux attach-session -t ${sessionName}"`;

  console.log(`🔗 Attaching to session: ${sessionName}...`);

  // 2. Open in iTerm2 if within Gemini AND NOT --local
  const isWithinGemini = !!env.GEMINI_CLI || !!env.GEMINI_SESSION_ID || !!env.GCLI_SESSION_ID;
  if (isWithinGemini && !isLocal) {
    const tempCmdPath = path.join(process.env.TMPDIR || '/tmp', `offload-attach-${prNumber}.sh`);
    fs.writeFileSync(tempCmdPath, `#!/bin/bash\n${finalSSH}\nrm "$0"`, { mode: 0o755 });

    const appleScript = `
      on run argv
        tell application "iTerm"
          set newWindow to (create window with default profile)
          tell current session of newWindow
            write text (item 1 of argv) & return
          end tell
          activate
        end tell
      end run
    `;
    spawnSync('osascript', ['-', tempCmdPath], { input: appleScript });
    console.log(`✅ iTerm2 window opened for ${sessionName}.`);
    return 0;
  }

  spawnSync(finalSSH, { stdio: 'inherit', shell: true });
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAttach(process.argv.slice(2)).catch(console.error);
}
