import { AsyncFzf } from 'fzf';

async function run() {
  const allFiles = ['src/file with (special) chars.txt', 'another-file.txt'];

  const fzf = new AsyncFzf(allFiles, { fuzzy: 'v2' });
  const pattern = 'src/file with \\(special\\) chars.txt';
  const unescapedPattern = pattern.replace(/\\(.)/g, '$1');

  console.log({ pattern, unescapedPattern });

  const results1 = await fzf.find(pattern);
  console.log(
    'Results with pattern:',
    results1.map((r) => r.item),
  );

  const results2 = await fzf.find(unescapedPattern);
  console.log(
    'Results with unescapedPattern:',
    results2.map((r) => r.item),
  );
}

run().catch(console.error);
