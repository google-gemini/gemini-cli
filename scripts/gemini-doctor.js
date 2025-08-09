#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function printOk(msg) {
  console.log(`${GREEN}${msg} [OK]${RESET}`);
}

function printBad(msg) {
  console.error(`${RED}${msg}${RESET}`);
}

function checkNodeVersion() {
  console.log('Checking Node.js version...');
  const requiredMajor = 20, requiredMinor = 0, requiredPatch = 0;
  const nodeVersion = process.version.replace(/^v/, '');
  const [major, minor, patch] = nodeVersion.split('.').map(Number);
  if (
    major < requiredMajor ||
    (major === requiredMajor && minor < requiredMinor) ||
    (major === requiredMajor && minor === requiredMinor && patch < requiredPatch)
  ) {
    printBad(`Node.js version ${nodeVersion} is too old. Required: >=20.0.0`);
  } else {
    printOk(`Node.js version ${nodeVersion}`);
  }
}

function checkCliVersion() {
  console.log('\nChecking Gemini CLI version...');
  try {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const data = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const version = data.version;
    if (version) {
      printOk(`Gemini CLI version ${version} is OK.`);
    } else {
      printBad('Gemini CLI version not found in package.json.');
    }
  } catch (err) {
    printBad('Could not read package.json: ' + err.message);
  }
}

function checkGcloudAuth() {
  console.log('\nChecking gcloud authentication...');
  const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (adcPath) {
    if (fs.existsSync(adcPath)) {
      printOk(`Using credentials from GOOGLE_APPLICATION_CREDENTIALS: ${adcPath}`);
      return;
    } else {
      printBad(`GOOGLE_APPLICATION_CREDENTIALS is set, but the file does not exist: ${adcPath}`);
      return;
    }
  }
  try {
    execSync('gcloud auth application-default print-access-token', { stdio: 'ignore' });
    printOk('gcloud ADC authentication is valid');
  } catch (err) {
    if (err.code === 'ENOENT') {
      printBad('gcloud command not found.');
      console.log('  - Please install the Google Cloud CLI (gcloud) and ensure it is in your PATH.');
    } else {
      printBad('gcloud ADC authentication failed.');
      console.log('  - Try running "gcloud auth application-default login" or setting GOOGLE_APPLICATION_CREDENTIALS.');
      if (err.stdout) {
        console.log('  - gcloud output:\n' + err.stdout.toString());
      }
    }
  }
}

function checkEnv() {
  console.log('\nChecking environment variables...');
  ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION'].forEach((varName) => {
    const value = process.env[varName];
    if (value) {
      printOk(`${varName} is set: ${value}`);
    } else {
      printBad(`${varName} is NOT set.`);
    }
  });
}

function checkApiEndpoint() {
  console.log('\nChecking API endpoint configuration...');
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION;
  if (geminiApiKey) {
    console.log('  + Using Gemini API key.');
    console.log('  - Endpoint: generativelanguage.googleapis.com');
  } else if (googleApiKey || (googleCloudProject && googleCloudLocation)) {
    console.log('  + Using Vertex AI.');
    if (googleCloudLocation) {
      console.log(`  - Endpoint: ${googleCloudLocation}-aiplatform.googleapis.com`);
    } else {
      console.log('  - GOOGLE_CLOUD_LOCATION is not set, cannot determine endpoint.');
    }
  } else {
    console.log('  - No API key or Vertex AI configuration found.');
  }
}

function main() {
  console.log('Gemini Doctor: Environment Diagnostics\n');
  checkNodeVersion();
  checkCliVersion();
  checkGcloudAuth();
  checkEnv();
  checkApiEndpoint();
  console.log('\nDoctor checks complete.');
}

main();
