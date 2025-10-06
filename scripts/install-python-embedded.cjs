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
  'numpy',
  'openpyxl',
  'requests',
  'pillow',
  'markitdown',
  'chromadb',
  'tvscreener',
  'yfinance',
  'ta',
  'selenium',
  'beautifulsoup4',
  'lxml',
  'feedparser',
  'textblob',
  'trafilatura',
  'scipy',
  'statsmodels',
  'arch'
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

async function setupPip(pythonDir) {
  log('Setting up pip...');
  const pythonExe = path.join(pythonDir, 'python.exe');
  const getPipPath = path.join(pythonDir, 'get-pip.py');

  // Check if pip is already installed
  try {
    execSync(`"${pythonExe}" -m pip --version`, { stdio: 'pipe' });
    log('pip is already installed');
    return;
  } catch {
    log('pip not found, installing...');
  }

  // Download get-pip.py if it doesn't exist or is outdated
  if (!fs.existsSync(getPipPath) || fs.statSync(getPipPath).size < 1000) {
    log('Downloading get-pip.py...');
    if (fs.existsSync(getPipPath)) {
      fs.unlinkSync(getPipPath); // Remove potentially corrupted file
    }
    await downloadFile('https://bootstrap.pypa.io/get-pip.py', getPipPath);
  }

  // Install pip with retry logic
  let retries = 3;
  while (retries > 0) {
    try {
      log('Installing pip...');
      execSync(`"${pythonExe}" "${getPipPath}"`, { stdio: 'inherit' });

      // Verify pip installation
      execSync(`"${pythonExe}" -m pip --version`, { stdio: 'pipe' });
      log('✅ pip installed successfully');
      break;
    } catch (error) {
      retries--;
      if (retries === 0) {
        throw new Error(`Failed to install pip after 3 attempts: ${error.message}`);
      }
      log(`Installation failed, retrying... (${retries} attempts remaining)`);
      // Wait a bit before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function installRequiredPackages(pythonDir) {
  log('Installing required Python packages...');
  const pythonExe = path.join(pythonDir, 'python.exe');

  // First, upgrade pip to latest version
  try {
    log('Upgrading pip to latest version...');
    execSync(`"${pythonExe}" -m pip install --upgrade pip`, { stdio: 'inherit' });
  } catch (err) {
    log('Warning: Failed to upgrade pip, continuing with current version');
  }

  const failedPackages = [];

  for (const pkg of REQUIRED_PACKAGES) {
    try {
      // Check if package is already installed
      try {
        execSync(`"${pythonExe}" -m pip show ${pkg}`, { stdio: 'pipe' });
        log(`✅ ${pkg} is already installed`);
        continue;
      } catch {
        // Package not installed, proceed to install
      }

      log(`Installing ${pkg}...`);
      // Use --no-cache-dir to avoid cache issues and remove --quiet for better debugging
      execSync(`"${pythonExe}" -m pip install ${pkg} --no-cache-dir`, { stdio: 'inherit' });

      // Verify installation
      execSync(`"${pythonExe}" -m pip show ${pkg}`, { stdio: 'pipe' });
      log(`✅ ${pkg} installed successfully`);
    } catch (err) {
      error(`Failed to install ${pkg}: ${err.message}`);
      failedPackages.push(pkg);
      // Continue with other packages
    }
  }

  if (failedPackages.length > 0) {
    error(`⚠️ Failed to install the following packages: ${failedPackages.join(', ')}`);
    error('You may need to install them manually using:');
    error(`"${pythonExe}" -m pip install ${failedPackages.join(' ')}`);
  } else {
    log('✅ All required packages installed successfully!');
  }
}

function setupPythonPath(pythonDir) {
  log('Configuring Python path...');

  // Create or update python313._pth file to include site-packages
  const pthFile = path.join(pythonDir, `python${PYTHON_VERSION.replace('.', '').substring(0, 3)}._pth`);
  // Use platform-specific path separator for Windows
  const pathSep = process.platform === 'win32' ? '\\' : '/';
  const pthContent = `python${PYTHON_VERSION.replace('.', '').substring(0, 3)}.zip
.
Lib
Lib${pathSep}site-packages

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
    await installRequiredPackages(PYTHON_DIR);

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