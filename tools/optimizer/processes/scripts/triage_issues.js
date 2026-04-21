import fs from 'fs';
import readline from 'readline';

async function processIssues() {
  const issuesFile = 'issues-before.csv';
  const afterFile = 'issues-after.csv';
  if (!fs.existsSync(issuesFile)) return 0;

  const inStream = fs.createReadStream(issuesFile);
  const outStream = fs.createWriteStream(afterFile);
  const rl = readline.createInterface({ input: inStream });

  // Extended with findings from investigations
  const spamWords = [
    'bullshit', 'stupido', 'wtf', 'shameless', 'untitled', 'problem', 'test', 'spam',
    '429', 'permission denied', 'quota', 'exhausted', 'oom', 'crash', 'slow', 'hang'
  ];
  let firstLine = true;
  let closedCount = 0;

  for await (const line of rl) {
    if (firstLine) {
      outStream.write(line + '\n');
      firstLine = false;
      continue;
    }
    
    // Simple CSV parse
    const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
    if (!parts || parts.length < 3) {
      outStream.write(line + '\n');
      continue;
    }

    let [number, title, state] = parts;
    const titleLower = title.toLowerCase();
    
    let shouldClose = false;
    for (const word of spamWords) {
      if (titleLower.includes(word)) {
        shouldClose = true;
        break;
      }
    }

    if (shouldClose && state.includes('OPEN')) {
      state = '"CLOSED"';
      closedCount++;
    }

    outStream.write(`${number},${title},${state}\n`);
  }
  
  return closedCount;
}

export default processIssues;