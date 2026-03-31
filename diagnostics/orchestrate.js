import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runScript = (name) => {
  console.log(`\n======================================`);
  console.log(`[EXEC] Running ${name}...`);
  try {
    // Add quotes around the path to handle spaces in directory names like "New folder"
    execSync(`node "${path.join(__dirname, name)}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`[ERROR] Script ${name} failed:`, err.message);
    if (name === '3-snapshot.js') {
      console.error("\n[VALID PR ERROR / CONFIG ISSUE] 3-Snapshot requires Node.js running with --inspect on port 9222 and the 'chrome-remote-interface' package. Skipping to continue the pipeline.");
    } else {
      throw err;
    }
  }
};

function main() {
  console.log("=== Gemini CLI Diagnostic Suite Orchestration ===");
  runScript('3-snapshot.js');
  runScript('analyze_memory.js');
  runScript('to_perfetto.js');
  runScript('gdb_batch.js');
  runScript('profile_bloat.js');
  runScript('root_cause.js');
  
  console.log("\n======================================");
  console.log("Orchestration complete. All artifacts generated in the diagnostics directory:");
  console.log("- snapshot[1|2|3].heapsnapshot");
  console.log("- retainer_chains.md");
  console.log("- trace.json");
  console.log("- debug.gdb");
  console.log("- bloat_report.md");
  console.log("- diagnostic_report.md");
}

main();
