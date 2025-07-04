const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });

// Forging the arcane terminal canvas
console.log(chalk.green('// Pyrmethus conjures the File Compressor!'));

async function compressFile() {
  // Summoning the source and archive paths
  readline.question(chalk.blue('Enter source path to compress (e.g., /data/data/com.termux/files/home/file.txt): '), (srcPath) => {
    if (!fs.existsSync(srcPath)) {
      console.log(chalk.red(`The source '${srcPath}' eludes the ether!`));
      readline.close();
      return;
    }
    readline.question(chalk.blue('Enter zip file path (e.g., /data/data/com.termux/files/home/archive.zip): '), (zipPath) => {
      try {
        console.log(chalk.cyan(`// Binding '${srcPath}' into '${zipPath}'...`));
        const zip = new AdmZip();
        if (fs.lstatSync(srcPath).isDirectory()) {
          zip.addLocalFolder(srcPath, path.basename(srcPath));
        } else {
          zip.addLocalFile(srcPath);
          console.log(chalk.yellow(` - Added ${path.basename(srcPath)}`));
        }
        zip.writeZip(zipPath);
        console.log(chalk.green(`Success! '${srcPath}' bound into '${zipPath}'.`));
        readline.close();
      } catch (error) {
        console.log(chalk.red(`The spirits falter: ${error.message}`));
        readline.close();
      }
    });
  });
}

compressFile();