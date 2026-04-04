import { readFileSync } from 'fs';

function extractEvals(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  
  const describeMatch = content.match(/describe\(['"`](.*?)['"`]/);
  const area = describeMatch ? describeMatch[1] : 'Unknown';
  
  const pattern = /\/\*\*([\s\S]*?)\*\/\s*evalTest\([^,]+,\s*\{[^}]*name:\s*['"`](.*?)['"`][^}]*prompt:\s*['"`](.*?)['"`]/g;
  
  const results = [];
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const comment = match[1].replace(/\s*\*\s?/g, ' ').trim();
    results.push({ name: match[2], prompt: match[3], comment });
  }
  
  return { area, tests: results };
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node doc-gen-script.mjs <path-to-eval-file>');
  process.exit(1);
}

const { area, tests } = extractEvals(filePath);
console.log(`### ${area}\n`);
tests.forEach((t, i) => {
  console.log(`**${i+1}. ${t.name}**`);
  console.log(`Prompt: "${t.prompt}"`);
  console.log(`${t.comment}\n`);
});