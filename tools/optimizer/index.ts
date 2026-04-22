import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const program = new Command();
  program
    .option('--investigate', 'Run investigation phase', false)
    .option('--update-processes', 'Update processes based on learnings', false)
    .option('--create-pr', 'Create a PR when updating processes', false)
    .option('--commit', 'Run processes and commit changes', false)
    .parse(process.argv);

  const options = program.opts();

  console.log('Optimizer1000 starting...');
  console.log('Options:', options);

  const rootDir = path.resolve(__dirname, '../..');
  
  // Ensure history directory exists so agent doesn't fail listing it
  await fs.mkdir(path.join(rootDir, 'history'), { recursive: true });

  // 0. Fetch previous artifacts
  try {
    console.log('Checking for previous artifacts...');
    // Check if any run exists for the current branch
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    const runCheck = execSync(`gh run list --branch ${branch} --limit 1 --json databaseId --jq '.[0].databaseId' || true`, { encoding: 'utf-8' }).trim();
    
    if (runCheck && runCheck !== '') {
      console.log('Attempting to fetch previous artifacts into history/ (timeout 30s)...');
      await fs.mkdir(path.join(rootDir, 'history'), { recursive: true });
      // Download will fail gracefully if the artifact name doesn't match
      execSync(`gh run download --name optimizer-results --pattern "*.csv" --dir history > /dev/null 2>&1 || true`, { 
        stdio: 'inherit',
        timeout: 30000,
        cwd: rootDir
      });
    } else {
      console.log('No previous runs found, skipping download.');
    }
  } catch (err) {
    console.warn('Artifact check/download skipped, proceeding with fresh state.');
  }

  // 1. Initial Metrics
  await runPhase('metrics', { PRE_RUN: 'true' }, options);

  // 2. Investigation (Optional)
  if (options.investigate) {
    await runPhase('investigations', {}, options);
  }

  // 3. Update Processes & Run
  await runPhase('processes', {
    UPDATE_PROCESSES: String(options.updateProcesses),
    COMMIT: String(options.commit),
  }, options);

  // 4. Final Metrics
  await runPhase('metrics', { PRE_RUN: 'false' }, options);

  console.log('\nOptimizer1000 completed.');
}

async function runPhase(phaseDir: string, env: Record<string, string>, options: any) {
  console.log(`\n--- Phase: ${phaseDir} ---`);
  const phasePath = path.join(__dirname, phaseDir);
  
  let promptFile: string | undefined;
  try {
    const files = await fs.readdir(phasePath);
    promptFile = files.find(f => f.endsWith('-AGENT.md'));
  } catch (err) {
    console.warn(`Directory ${phaseDir} not found or inaccessible.`);
    return;
  }
  
  if (!promptFile) {
    console.warn(`No agent prompt found in ${phaseDir}`);
    return;
  }

  const instructionsPath = path.join(phasePath, promptFile);
  const instructionsContent = await fs.readFile(instructionsPath, 'utf8');

  const envString = Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n');
  const userPrompt = `Execution Context:\n${envString}\n\n${instructionsContent}\n\nPlease proceed with the ${phaseDir} tasks as defined in your instructions. Always output CSV files as requested.`;

  console.log(`Running agent with prompt: ${promptFile}`);
  
  // Resolve root to call the CLI binary
  const rootDir = path.resolve(__dirname, '../..');
  
  try {
    // Run GCLI non-interactively with --yolo to bypass policies
    const cliPath = path.join(rootDir, 'packages', 'cli');
    
    await new Promise<void>((resolve, reject) => {
      const child = spawn('node', [cliPath, '--prompt', userPrompt, '--yolo', '--model', 'gemini-3-flash-preview'], {
        stdio: 'inherit',
        cwd: rootDir,
        env: { ...process.env, ...env }
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Exit code ${code}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  } catch (err: any) {
    console.error(`Error in phase ${phaseDir}:`, err.message);
  }

  console.log(`\n--- Finished Phase: ${phaseDir} ---`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
