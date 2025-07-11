// This is the correct code for a file named diagnose-mime.cjs
const mime = require('mime-types');

console.log('--- Mime-types Diagnosis ---');
const extensions = ['.mp4', '.mov', '.mp3', '.wav', '.ts', '.js', '.png', '.pdf'];

extensions.forEach(ext => {
    const lookupResult = mime.lookup(ext);
    console.log(`mime.lookup('${ext}') -> '${lookupResult}' (Type: ${typeof lookupResult})`);
});
console.log('--- End of Diagnosis ---');