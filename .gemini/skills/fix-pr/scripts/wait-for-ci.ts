/**
 * CI Waiter Utility for Fix PR Skill
 * Blocks until GitHub checks for the current branch are complete.
 */
import { spawnSync } from 'child_process';

async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔍 Waiting for GitHub Checks to complete...');
  
  let attempts = 0;
  const maxAttempts = 30; // 15 minutes total

  while (attempts < maxAttempts) {
    const checkStatus = spawnSync('gh', ['pr', 'checks'], { shell: true });
    const output = checkStatus.stdout.toString();
    
    if (output.includes('fail')) {
      console.log('❌ CI Failed.');
      process.exit(1);
    } else if (output.includes('pending')) {
      console.log(`⏳ CI still pending... (check ${attempts + 1}/${maxAttempts})`);
      await wait(30000); // 30 seconds
    } else if (output.trim() === '') {
        console.log('⚠️ No checks found yet, waiting...');
        await wait(10000);
    } else {
      console.log('✅ CI Passed!');
      process.exit(0);
    }
    attempts++;
  }

  console.error('⏰ Timeout waiting for CI.');
  process.exit(1);
}

main().catch(console.error);
