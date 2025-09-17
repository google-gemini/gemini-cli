/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const PYTHON_VERSION = '3.13.7';
const PYTHON_DIR = path.join(__dirname, '..', 'packages', `python-${PYTHON_VERSION}`);

// Python embedded download URLs by platform
const PYTHON_URLS = {
  win32: {
    x64: `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`,
    arm64: `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-arm64.zip`
  }
};

// Required pip packages
const REQUIRED_PACKAGES = [
  'xlwings',
  'pandas',
  'openpyxl',
  'requests',
  'pillow',
  'markitdown'
];

function log(message) {
  console.log(`[Python Installer] ${message}`);
}

function error(message) {
  console.error(`[Python Installer Error] ${message}`);
}

function checkPythonExists() {
  const pythonExe = path.join(PYTHON_DIR, 'python.exe');
  return fs.existsSync(pythonExe);
}

function getPlatformInfo() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform !== 'win32') {
    throw new Error(`Python embedded installer currently only supports Windows. Platform: ${platform}`);
  }

  if (arch !== 'x64' && arch !== 'arm64') {
    throw new Error(`Unsupported architecture: ${arch}. Only x64 and arm64 are supported.`);
  }

  return { platform, arch };
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    log(`Downloading Python embedded from: ${url}`);

    const file = fs.createWriteStream(destPath);
    const request = https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirects
        return downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize) {
          const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(`\r[Python Installer] Download progress: ${percent}%`);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        console.log('\n');
        log('Download completed');
        file.close();
        resolve();
      });
    });

    request.on('error', (err) => {
      fs.unlink(destPath, () => {}); // Delete partial file
      reject(err);
    });

    file.on('error', (err) => {
      fs.unlink(destPath, () => {}); // Delete partial file
      reject(err);
    });
  });
}

function extractZip(zipPath, extractDir) {
  log('Extracting Python embedded archive...');

  try {
    // Try using PowerShell for extraction on Windows
    const powershellCmd = `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`;
    execSync(powershellCmd, { stdio: 'inherit' });
    log('Extraction completed using PowerShell');
  } catch (powershellError) {
    error('PowerShell extraction failed, trying alternative method');

    try {
      // Fallback: try using tar (available on Windows 10+)
      const tarCmd = `tar -xf "${zipPath}" -C "${extractDir}"`;
      execSync(tarCmd, { stdio: 'inherit' });
      log('Extraction completed using tar');
    } catch (tarError) {
      throw new Error(`Failed to extract archive. PowerShell error: ${powershellError.message}, tar error: ${tarError.message}`);
    }
  }
}

function setupPip(pythonDir) {
  log('Setting up pip...');
  const pythonExe = path.join(pythonDir, 'python.exe');
  const getPipPath = path.join(pythonDir, 'get-pip.py');

  // Download get-pip.py if it doesn't exist
  if (!fs.existsSync(getPipPath)) {
    log('Downloading get-pip.py...');
    return downloadFile('https://bootstrap.pypa.io/get-pip.py', getPipPath)
      .then(() => {
        log('Installing pip...');
        execSync(`"${pythonExe}" "${getPipPath}"`, { stdio: 'inherit' });
      });
  } else {
    log('get-pip.py already exists, installing pip...');
    execSync(`"${pythonExe}" "${getPipPath}"`, { stdio: 'inherit' });
  }
}

function installRequiredPackages(pythonDir) {
  log('Installing required Python packages...');
  const pythonExe = path.join(pythonDir, 'python.exe');

  for (const pkg of REQUIRED_PACKAGES) {
    try {
      log(`Installing ${pkg}...`);
      execSync(`"${pythonExe}" -m pip install ${pkg} --quiet`, { stdio: 'inherit' });
      log(`✅ ${pkg} installed successfully`);
    } catch (error) {
      error(`Failed to install ${pkg}: ${error.message}`);
      // Continue with other packages
    }
  }
}

function setupPythonPath(pythonDir) {
  log('Configuring Python path...');

  // Create or update python313._pth file to include site-packages
  const pthFile = path.join(pythonDir, `python${PYTHON_VERSION.replace('.', '').substring(0, 3)}._pth`);
  const pthContent = `python${PYTHON_VERSION.replace('.', '').substring(0, 3)}.zip
.
Lib
Lib/site-packages

# Uncomment to run site.main() automatically
import site
`;

  fs.writeFileSync(pthFile, pthContent, 'utf8');
  log('Python path configuration updated');
}

async function installPythonEmbedded() {
  try {
    if (checkPythonExists()) {
      log('Python embedded environment already exists, skipping installation');
      return;
    }

    log(`Installing Python ${PYTHON_VERSION} embedded environment...`);

    const { platform, arch } = getPlatformInfo();
    const downloadUrl = PYTHON_URLS[platform][arch];

    if (!downloadUrl) {
      throw new Error(`No download URL available for ${platform}-${arch}`);
    }

    // Create packages directory if it doesn't exist
    const packagesDir = path.dirname(PYTHON_DIR);
    if (!fs.existsSync(packagesDir)) {
      fs.mkdirSync(packagesDir, { recursive: true });
    }

    // Download Python embedded
    const zipPath = path.join(packagesDir, `python-${PYTHON_VERSION}-embed.zip`);
    await downloadFile(downloadUrl, zipPath);

    // Create Python directory
    if (!fs.existsSync(PYTHON_DIR)) {
      fs.mkdirSync(PYTHON_DIR, { recursive: true });
    }

    // Extract archive
    extractZip(zipPath, PYTHON_DIR);

    // Clean up download
    fs.unlinkSync(zipPath);

    // Setup Python path configuration
    setupPythonPath(PYTHON_DIR);

    // Setup pip
    await setupPip(PYTHON_DIR);

    // Install required packages
    installRequiredPackages(PYTHON_DIR);

    log('✅ Python embedded environment installation completed successfully!');

  } catch (err) {
    error(`Installation failed: ${err.message}`);
    process.exit(1);
  }
}

// Run installation if called directly
if (require.main === module) {
  installPythonEmbedded();
}

module.exports = { installPythonEmbedded, checkPythonExists };