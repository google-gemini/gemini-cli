const axios = require('axios');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });

// Forging the radiant terminal glow
console.log(chalk.green('// Pyrmethus invokes the File Downloader!'));

async function downloadFile() {
  // Summoning the URL
  readline.question(chalk.blue('Enter the URL to download (e.g., https://example.com/file.txt): '), async (url) => {
    readline.question(chalk.blue('Enter destination path (e.g., /data/data/com.termux/files/home/download.txt): '), async (destPath) => {
      if (fs.existsSync(destPath)) {
        readline.question(chalk.yellow(`'${destPath}' exists. Overwrite? (y/n): `), async (confirm) => {
          if (confirm.toLowerCase() !== 'y') {
            console.log(chalk.yellow('Download aborted.'));
            readline.close();
            return;
          }
          await performDownload(url, destPath);
        });
      } else {
        await performDownload(url, destPath);
      }
    });
  });
}

async function performDownload(url, destPath) {
  try {
    console.log(chalk.cyan(`// Summoning file from '${url}'...`));
    const response = await axios.get(url, { responseType: 'stream' });
    const writer = fs.createWriteStream(destPath);
    response.data.on('data', () => process.stdout.write(chalk.yellow('.')));
    response.data.pipe(writer);
    writer.on('finish', () => {
      console.log(chalk.green(`\nSuccess! File summoned to '${destPath}'.`));
      readline.close();
    });
    writer.on('error', (error) => {
      console.log(chalk.red(`The spirits falter: ${error.message}`));
      readline.close();
    });
  } catch (error) {
    console.log(chalk.red(`The ether resists: ${error.message}`));
    readline.close();
  }
}

downloadFile();