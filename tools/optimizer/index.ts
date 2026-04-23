import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const program = new Command();
  program
    .option('--investigate', 'Run deep investigation (Brain phase)', false)
    .option('--pulse', 'Run high-frequency reflex actions (Pulse phase)', false)
    .option('--create-pr', 'Create a PR when updating processes', false)
    .option('--execute-actions', 'Actually execute state-changing actions', false)
    .parse(process.argv);

  const options = program.opts();

  console.log('Optimizer1000 starting...');
  console.log('Options:', options);

  const rootDir = path.resolve(__dirname, '../..');
  
  // Ensure history directory exists
  await fs.mkdir(path.join(rootDir, 'history'), { recursive: true });

  // 0. Fetch previous artifacts (Memory)
  await syncHistory(rootDir);

  const policyPath = options.executeActions ? undefined : path.join(__dirname, 'policies', 'readonly-gh.toml');

  // 1. Initial Metrics (Deterministic)
  await runMetrics(true, rootDir);

  // 2. Investigation & Update Processes (Agentic - Brain Phase)
  if (options.investigate) {
    await runAgentPhase('investigations', {
      EXECUTE_ACTIONS: String(options.executeActions),
    }, options, undefined);

    // 3. Critique Phase (Only runs if investigations ran)
    await runAgentPhase('critique', {
      CREATE_PR: String(options.createPr),
      EXECUTE_ACTIONS: String(options.executeActions),
    }, options, undefined);
  }

  // 4. Run Processes (Pulse Phase)
  // In v1, Pulse runs are deterministic script executions.
  if (options.pulse || options.investigate) {
    await runProcesses(options.executeActions, rootDir);
  }

  // 5. Final Metrics (Deterministic)
  await runMetrics(false, rootDir);

  console.log('\nOptimizer1000 completed.');
}

/**
 * Runs repository metrics deterministically by executing scripts in metrics/scripts/
 */
async function runMetrics(preRun: boolean, rootDir: string) {
  const phase = preRun ? 'before' : 'after';
  console.log(`\n--- Phase: metrics (${phase}) ---`);
  
  const scriptsDir = path.join(__dirname, 'metrics', 'scripts');
  const scripts = await fs.readdir(scriptsDir);
  const jsScripts = scripts.filter(s => s.endsWith('.js') || s.endsWith('.ts'));
  
  const results: any[] = [];
  
  for (const script of jsScripts) {
    console.log(`Running metric script: ${script}`);
    try {
      const scriptPath = path.join(scriptsDir, script);
      const command = script.endsWith('.ts') ? `npx tsx ${scriptPath}` : `node ${scriptPath}`;
      const output = execSync(command, { encoding: 'utf-8', cwd: rootDir });
      
      // Scripts should output JSON objects per line
      const lines = output.trim().split('\n');
      for (const line of lines) {
        try {
          results.push(JSON.parse(line));
        } catch {
          // Fallback for non-JSON output
          if (line) console.log(`[Script Output]: ${line}`);
        }
      }
    } catch (err: any) {
      console.error(`Error running ${script}:`, err.message);
    }
  }
  
  const outputFile = path.join(rootDir, `metrics-${phase}.csv`);
  const csvContent = jsonToCsv(results);
  await fs.writeFile(outputFile, csvContent);
  console.log(`Metrics saved to ${outputFile}`);
}

/**
 * Runs optimization processes deterministically
 */
async function runProcesses(execute: boolean, rootDir: string) {
  console.log(`\n--- Phase: processes ---`);
  const scriptsDir = path.join(__dirname, 'processes', 'scripts');
  
  // We look for a PROCESSES.md to see what's active, but for now we just run all .ts scripts in the dir
  const scripts = await fs.readdir(scriptsDir);
  const activeScripts = scripts.filter(s => s.endsWith('.ts') && s !== 'utils.ts');
  
  for (const script of activeScripts) {
    console.log(`Running process: ${script}`);
    try {
      const scriptPath = path.join(scriptsDir, script);
      execSync(`npx tsx ${scriptPath}`, {
        stdio: 'inherit',
        cwd: rootDir,
        env: { ...process.env, EXECUTE_ACTIONS: String(execute) }
      });
    } catch (err: any) {
      console.error(`Error running process ${script}:`, err.message);
    }
  }
}

/**
 * Runs an agentic phase using GCLI
 */
async function runAgentPhase(phaseDir: string, env: Record<string, string>, options: any, policyPath?: string) {
  console.log(`\n--- Phase: ${phaseDir} (Agentic) ---`);
  const phasePath = path.join(__dirname, phaseDir);
  
  const files = await fs.readdir(phasePath);
  const promptFile = files.find(f => f.endsWith('-AGENT.md'));
  
  if (!promptFile) {
    console.warn(`No agent prompt found in ${phaseDir}`);
    return;
  }

  const instructionsPath = path.join(phasePath, promptFile);
  const instructionsContent = await fs.readFile(instructionsPath, 'utf8');

  const envString = Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
  const userPrompt = `Execution Context:\n${envString}\n\n${instructionsContent}\n\nPlease proceed with the ${phaseDir} tasks.`;

  const rootDir = path.resolve(__dirname, '../..');
  const cliPath = path.join(rootDir, 'packages', 'cli');
  const args = ['--prompt', userPrompt, '--yolo', '--model', 'gemini-3-flash-preview'];
  
  if (policyPath) args.push('--admin-policy', policyPath);
  
  await new Promise<void>((resolve, reject) => {
    const child = spawn('node', [cliPath, ...args], {
      stdio: 'inherit',
      cwd: rootDir,
      env: { ...process.env, ...env }
    });
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Exit code ${code}`)));
    child.on('error', reject);
  });
}

async function syncHistory(rootDir: string) {
  try {
    console.log('Checking for previous artifacts...');
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    const runCheck = execSync(`gh run list --branch ${branch} --limit 1 --json databaseId --jq '.[0].databaseId' || true`, { encoding: 'utf-8' }).trim();
    
    if (runCheck && runCheck !== '') {
      console.log('Fetching previous artifacts into history/...');
      execSync(`gh run download --name optimizer-pulse-results --pattern "*.csv" --dir history > /dev/null 2>&1 || true`, { 
        stdio: 'inherit',
        timeout: 30000,
        cwd: rootDir
      });
      execSync(`gh run download --name optimizer-brain-results --pattern "*.csv" --dir history > /dev/null 2>&1 || true`, { 
        stdio: 'inherit',
        timeout: 30000,
        cwd: rootDir
      });
    }
  } catch (err) {
    console.warn('Artifact sync skipped.');
  }
}

function jsonToCsv(items: any[]): string {
  if (items.length === 0) return '';
  const headers = Array.from(new Set(items.flatMap(item => Object.keys(item))));
  const csvRows = [headers.join(',')];
  for (const item of items) {
    const values = headers.map(header => {
      const val = item[header] ?? '';
      const stringVal = String(val);
      return stringVal.includes(',') ? `"${stringVal.replace(/"/g, '""')}"` : stringVal;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
