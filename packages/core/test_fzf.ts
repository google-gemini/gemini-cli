import { unescapePath } from './src/utils/paths.js';
console.log(process.platform);
console.log(unescapePath('src/file with \\(special\\) chars.txt'));
